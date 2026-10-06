import type { LintIssue, LintOptions, PickierConfig } from './types'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { version } from '../package.json'

/**
 * Lint results kept between runs (`--cache`, or `lint.cache` in the config).
 *
 * An entry is a file's issues together with a hash of the content they were
 * computed from, so an edited file is linted again. The cache as a whole is
 * only reused by a run with the same Pickier version, the same resolved
 * config - rule functions included, so a changed plugin invalidates it - and
 * the same run options; anything else starts from empty. Runs that write
 * files (`--fix`, `--write`) neither read nor write it.
 */
export const DEFAULT_CACHE_LOCATION = '.pickiercache'

interface CacheFile {
  key: string
  files: Record<string, { hash: string, issues: LintIssue[] }>
}

export interface LintCache {
  /** The cached issues for `file`, if its content is what they were computed from. */
  get: (file: string, content: string) => LintIssue[] | undefined
  set: (file: string, content: string, issues: LintIssue[]) => void
  /** Write the cache, keeping only the files linted in this run. */
  save: () => void
}

export function hashContent(content: string): string {
  return Bun.hash(content).toString(36)
}

/** The parts of a run that decide its results, as one string. */
function runKey(cfg: PickierConfig, options: LintOptions): string {
  const fingerprint = JSON.stringify({ cfg, options: { formatOnly: !!options._formatOnly, fix: !!options.fix, dryRun: !!options.dryRun, ext: options.ext } }, (_key, value) =>
    typeof value === 'function' ? `fn:${value.toString()}` : value instanceof RegExp ? `re:${value}` : value)
  return `${version}:${hashContent(fingerprint)}`
}

/** Whether this run may use the cache: asked for, and writing nothing. */
export function cacheApplies(cfg: PickierConfig, options: LintOptions): boolean {
  const asked = options.cache ?? cfg.lint?.cache ?? false
  const writes = (options.fix || options._formatOnly) && !options.dryRun
  return !!asked && !writes
}

export function openLintCache(cfg: PickierConfig, options: LintOptions, location: string = DEFAULT_CACHE_LOCATION): LintCache {
  const path = resolve(process.cwd(), location)
  const key = runKey(cfg, options)
  let previous: CacheFile['files'] = {}
  try {
    const stored = JSON.parse(readFileSync(path, 'utf8')) as CacheFile
    if (stored.key === key && stored.files && typeof stored.files === 'object')
      previous = stored.files
  }
  catch {
    // No cache yet, or unreadable: start empty
  }
  const next: CacheFile['files'] = {}

  return {
    get(file, content) {
      const entry = previous[file]
      if (entry && entry.hash === hashContent(content)) {
        next[file] = entry
        return entry.issues
      }
      return undefined
    },
    set(file, content, issues) {
      next[file] = { hash: hashContent(content), issues }
    },
    save() {
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, JSON.stringify({ key, files: next } satisfies CacheFile))
      }
      catch {
        // A cache that cannot be written only costs the next run time
      }
    },
  }
}
