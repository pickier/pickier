import type { LintIssue, LintOptions } from './types'
import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { ENV } from './utils'

/** Below this many files a worker's start-up costs more than it saves. */
const MIN_FILES_FOR_WORKERS = 32
/** Never start more workers than one per this many files. */
const FILES_PER_WORKER = 8
/** Files handed to a worker at a time; small, so workers finish together. */
const BATCH_SIZE = 4

/**
 * How many worker threads to lint `fileCount` files with; 0 or 1 means the
 * main thread alone. PICKIER_WORKERS overrides the choice.
 */
export function workerThreadsFor(fileCount: number): number {
  const configured = ENV.WORKERS
  if (configured !== null)
    return Math.min(configured, fileCount)
  if (fileCount < MIN_FILES_FOR_WORKERS)
    return 0
  return Math.min(Math.max(1, availableParallelism() - 1), Math.ceil(fileCount / FILES_PER_WORKER))
}

/**
 * Workers a run has finished with, by entry, ready for the next run to pick
 * up. A worker is never terminated: `Worker.terminate()`, and a worker that
 * exits itself, both segfault Bun while sibling workers are running (#1379),
 * so a worker that is out of files is parked here instead, unref'd so that
 * it cannot hold the process open. The pool bounds what a long-lived process
 * (the VS Code extension lints a whole workspace this way) keeps alive, and
 * saves the next run its start-up.
 */
const parked = new Map<string, Worker[]>()

/** Never park more than this many workers; the rest are left to the process. */
const MAX_PARKED = Math.max(1, availableParallelism() - 1)

/** A worker for `entry`: one a previous run parked, or a new one. */
function takeWorker(entry: string): Worker {
  const pool = parked.get(entry)
  const worker = pool?.pop()
  if (worker) {
    // Parked workers are unref'd; this run waits on its messages
    worker.ref()
    return worker
  }
  const fresh = new Worker(entry)
  // Gone for good: a run must not pick it up out of the pool and then wait
  // for a message it will never send
  fresh.addEventListener('close', () => {
    const idle = parked.get(entry)
    const at = idle?.indexOf(fresh) ?? -1
    if (at >= 0)
      idle!.splice(at, 1)
  })
  return fresh
}

/** Park an idle worker for the next run, or leave it to the process. */
function parkWorker(entry: string, worker: Worker): void {
  worker.unref()
  const pool = parked.get(entry)
  if (!pool)
    parked.set(entry, [worker])
  else if (pool.length < MAX_PARKED)
    pool.push(worker)
}

/**
 * The worker script: next to this file when running from source, and at
 * `src/lint-worker.js` beside the bundled chunk in a build. Null when neither
 * exists - a standalone compiled binary - and the run stays on one thread.
 */
function workerEntry(): string | null {
  for (const candidate of ['./lint-worker.ts', './lint-worker.js', './src/lint-worker.js']) {
    const url = new URL(candidate, import.meta.url)
    try {
      // Bun.fileURLToPath: node:url costs ~6 ms to load, on every run
      if (url.protocol === 'file:' && existsSync(Bun.fileURLToPath(url)))
        return url.href
    }
    catch {
      // not a usable path; try the next one
    }
  }
  return null
}

/**
 * Lint `files` across `count` worker threads, each running the same
 * `lintFileForRun` the main thread does with the same config, and return the
 * issues in file order - exactly what linting them one by one returns.
 *
 * Files are handed out a few at a time as workers free up. A file a worker
 * could not finish (it failed to start, or crashed) is linted on this thread
 * with `lintHere`, as is everything when no worker can be started. An error
 * thrown while linting a file is rethrown here, as it would be on one thread.
 *
 * A worker that is out of files is parked for the next run rather than
 * terminated, and one that reported an error is left to come to rest first:
 * tearing a worker down while its siblings are running segfaults Bun (#1379).
 */
export async function lintInWorkers(
  files: string[],
  options: LintOptions,
  count: number,
  lintHere: (file: string) => Promise<LintIssue[]>,
  entry: string | null = workerEntry(),
): Promise<LintIssue[][]> {
  const results = new Array<LintIssue[] | undefined>(files.length)

  if (entry !== null) {
    let next = 0
    const takeBatch = (): Array<[number, string]> => {
      const batch: Array<[number, string]> = []
      while (batch.length < BATCH_SIZE && next < files.length) {
        batch.push([next, files[next]!])
        next++
      }
      return batch
    }

    const workers: Worker[] = []
    try {
      await new Promise<void>((resolve, reject) => {
        let live = 0
        // The first error a worker reported, raised once every worker is idle
        let failure: Error | null = null
        const settle = (): void => {
          if (failure)
            reject(failure)
          else
            resolve()
        }

        const start = (): void => {
          let worker: Worker
          try {
            worker = takeWorker(entry)
          }
          catch {
            return
          }
          workers.push(worker)
          live++
          let inFlight: Array<[number, string]> = []
          // A worker ends once: out of files, failed, or gone without a word
          let ended = false
          const finished = (reusable: boolean): void => {
            if (ended)
              return
            ended = true
            worker.onmessage = null
            worker.onerror = null
            worker.removeEventListener('close', lost)
            if (reusable)
              parkWorker(entry, worker)
            live--
            if (live === 0)
              settle()
          }

          const send = (): void => {
            inFlight = takeBatch()
            if (inFlight.length === 0)
              finished(true)
            else
              worker.postMessage({ type: 'lint', batch: inFlight })
          }

          worker.onmessage = (event: MessageEvent) => {
            const message = event.data
            if (message.type === 'done') {
              for (const [index, issues] of message.results as Array<[number, LintIssue[]]>)
                results[index] = issues
              send()
            }
            else if (message.type === 'error') {
              // Hand out no more files and let the other workers come to
              // rest; the error is raised once they have.
              failure ??= new Error(message.message)
              next = files.length
              inFlight = []
              finished(false)
            }
          }
          // Failed to load, threw, or exited: its unfinished files fall to
          // this thread. An exit raises no error event, only `close`.
          const lost = (): void => {
            inFlight = []
            finished(false)
          }
          worker.onerror = lost
          worker.addEventListener('close', lost)

          try {
            worker.postMessage({ type: 'init', options })
          }
          catch {
            // Options that cannot be cloned: lint everything here instead
            finished(false)
            return
          }
          send()
        }

        for (let k = 0; k < count; k++)
          start()
        if (live === 0)
          settle()
      })
    }
    finally {
      // A worker still going - the run failed before it was done - is left
      // alive, and only kept from holding the process open
      for (const worker of workers)
        worker.unref()
    }
  }

  for (let i = 0; i < files.length; i++) {
    if (results[i] === undefined)
      results[i] = await lintHere(files[i]!)
  }
  return results as LintIssue[][]
}
