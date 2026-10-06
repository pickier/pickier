import type { LintIssue, LintOptions } from './types'
import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
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
 * The worker script: next to this file when running from source, and at
 * `src/lint-worker.js` beside the bundled chunk in a build. Null when neither
 * exists - a standalone compiled binary - and the run stays on one thread.
 */
function workerEntry(): string | null {
  for (const candidate of ['./lint-worker.ts', './lint-worker.js', './src/lint-worker.js']) {
    const url = new URL(candidate, import.meta.url)
    try {
      if (url.protocol === 'file:' && existsSync(fileURLToPath(url)))
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

        const start = (): void => {
          let worker: Worker
          try {
            worker = new Worker(entry)
          }
          catch {
            return
          }
          workers.push(worker)
          live++
          let inFlight: Array<[number, string]> = []
          // A worker ends once: out of files, failed, or gone without a word
          let ended = false
          const finished = (): void => {
            if (ended)
              return
            ended = true
            worker.terminate()
            live--
            if (live === 0)
              resolve()
          }

          const send = (): void => {
            inFlight = takeBatch()
            if (inFlight.length === 0)
              finished()
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
              reject(new Error(message.message))
            }
          }
          // Failed to load, threw, or exited: its unfinished files fall to
          // this thread. An exit raises no error event, only `close`.
          const lost = (): void => {
            inFlight = []
            finished()
          }
          worker.onerror = lost
          worker.addEventListener('close', lost)

          try {
            worker.postMessage({ type: 'init', options })
          }
          catch {
            // Options that cannot be cloned: lint everything here instead
            finished()
            return
          }
          send()
        }

        for (let k = 0; k < count; k++)
          start()
        if (live === 0)
          resolve()
      })
    }
    finally {
      for (const worker of workers)
        worker.terminate()
    }
  }

  for (let i = 0; i < files.length; i++) {
    if (results[i] === undefined)
      results[i] = await lintHere(files[i]!)
  }
  return results as LintIssue[][]
}
