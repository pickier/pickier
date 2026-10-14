import type { FormatOptions, LintOptions } from './types'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { formatCode } from './format'
import { loadConfigFromPath } from './utils'

export type RunOptions = (Partial<LintOptions> & Partial<FormatOptions>) & {
  mode?: 'auto' | 'lint' | 'format'
}

/** Whether formatting may write: --write, or --fix as its alias. */
function wantsWrite(options: RunOptions): boolean {
  return options.write === true || options.fix === true
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
        if (fmt === src)
          return 0
        if (wantsWrite(options)) {
          writeFileSync(filePath, fmt, 'utf8')
          return 0
        }
        // Not formatted, and not asked to write: the full path below reports
        // it, exactly as it does for a directory or a glob
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
      // Formatting rewrites files only when asked to. Without --write it
      // reports what is not formatted and exits non-zero, the same as
      // --check and the same as the single-file path above - rather than
      // rewriting every file the globs match.
      dryRun: !wantsWrite(options),
      ext: options.ext,
      _formatOnly: true,
    }
    return runLint(globs, lintOpts)
  }

  // auto mode: infer from flags. We only write fixes when the user explicitly
  // asked for them (--write, --fix), or via --check (which runs dry-run fix).
  // Bare `pickier .` is read-only lint, matching ESLint conventions and avoiding
  // accidental destructive edits on docs/templates from a casual invocation.
  const wantsFix = options.fix === true || options.write === true || options.check === true
  if (!wantsFix)
    return runLint(globs, options as LintOptions)

  const lintOpts: LintOptions = {
    ...(options as any),
    fix: true,
    dryRun: !!options.check,
    ext: options.ext,
  }
  return runLint(globs, lintOpts)
}
