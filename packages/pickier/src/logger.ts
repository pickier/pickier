import type { Logger } from '@stacksjs/clarity'

type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LazyLogger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  /** Load the logger now, so later messages are written as they happen. */
  ready: () => Promise<void>
}

// Every message not yet written, in order. flushLogs() waits on it.
let pending: Promise<void> = Promise.resolve()

/**
 * A logger that imports @stacksjs/clarity the first time it is used.
 *
 * Importing clarity costs ~10 ms - it pulls in node:crypto, zlib and Node
 * streams and loads its own config - and an ordinary lint run logs nothing
 * through it. Messages logged before it has loaded are queued in order and
 * written as soon as it is; callers that exit right after logging must await
 * flushLogs() first.
 */
export function createLazyLogger(name: string): LazyLogger {
  let logger: Logger | null = null
  let loading: Promise<Logger> | null = null
  const load = (): Promise<Logger> => {
    loading ??= import('@stacksjs/clarity').then((m) => {
      logger = new m.Logger(name, { showTags: false })
      return logger
    })
    return loading
  }
  const emit = (level: Level, args: unknown[]): void => {
    if (logger) {
      void (logger[level] as (...a: unknown[]) => unknown)(...args)
      return
    }
    pending = pending
      .then(load)
      .then((l) => { void (l[level] as (...a: unknown[]) => unknown)(...args) })
      .catch(() => {})
  }
  return {
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
    ready: async () => { await load() },
  }
}

/** Resolves once every message logged so far has been handed to clarity. */
export function flushLogs(): Promise<void> {
  return pending
}
