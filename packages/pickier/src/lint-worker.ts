/**
 * A lint worker thread for lintInWorkers (parallel.ts).
 *
 * It loads the config exactly as the main thread did - same cwd, same
 * options, same environment - and lints the batches of files it is sent with
 * the same lintFileForRun, posting each batch's issues back by file index.
 */
import type { LintIssue, LintOptions, PickierConfig } from './types'
import { lintFileForRun } from './linter'
import { flushLogs } from './logger'
import { loadConfigFromPath } from './utils'

declare const self: Worker

let options: LintOptions
let config: Promise<PickierConfig> | null = null

self.onmessage = async (event: MessageEvent) => {
  const message = event.data
  if (message.type === 'init') {
    options = message.options
    config = loadConfigFromPath(options.config)
    return
  }

  try {
    const cfg = await config!
    const results: Array<[number, LintIssue[]]> = []
    for (const [index, file] of message.batch as Array<[number, string]>)
      results.push([index, await lintFileForRun(file, cfg, options)])
    // The main thread terminates this worker once the files run out
    await flushLogs()
    postMessage({ type: 'done', results })
  }
  catch (e: any) {
    await flushLogs()
    postMessage({ type: 'error', message: e?.message || String(e) })
  }
}
