import type { FormatOptions, LintOptions } from './types'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { formatCode } from './format'
import { loadConfigFromPath } from './utils'

export type RunOptions = (Partial<LintOptions> & Partial<FormatOptions>) & {
  mode?: 'auto' | 'lint' | 'format'
}

export async function runUnified(globs: string[], options: RunOptions): Promise<number> {
  const mode = options.mode || 'auto'

  // FAST PATH: format mode with a single concrete file (no glob chars)
  // Avoids importing linter.ts and its heavy deps (plugins, logger)
  if (mode === 'format' && globs.length === 1 && !/[*?[\]{}()!]/.test(globs[0])) {
    try {
      const p = globs[0]
      const filePath = isAbsolute(p) ? p : resolve(process.cwd(), p)
      const st = statSync(filePath)
      if (st.isFile()) {
        const cfg = await loadConfigFromPath(options.config)
        const src = readFileSync(filePath, 'utf8')
        const fmt = formatCode(src, cfg, filePath)
        if (options.write && fmt !== src) {
          writeFileSync(filePath, fmt, 'utf8')
        }
        return 0
      }
    }
    catch {
      // Fall through to full linter path
    }
  }

  // Full path: dynamically import linter to defer its heavy deps
  const { runLint } = await import('./linter')

  if (mode === 'lint')
    return runLint(globs, options as LintOptions)

  if (mode === 'format') {
    const lintOpts: LintOptions = {
      ...(options as any),
      fix: true,
      dryRun: !!options.check,
      ext: options.ext,
      _formatOnly: true,
    }
    return runLint(globs, lintOpts)
  }

  // auto mode: infer from flags
  if (options.fix != null || options.reporter != null || options.maxWarnings != null || options.dryRun != null)
    return runLint(globs, options as LintOptions)
  // default to format path via lint fixer to keep unification
  const lintOpts: LintOptions = {
    ...(options as any),
    fix: true,
    dryRun: !!options.check,
    ext: options.ext,
  }
  return runLint(globs, lintOpts)
}
