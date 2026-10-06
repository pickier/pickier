import type { LintIssue, PickierConfig } from './types'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { plannedCheckRules } from './linter'
import { resolveRuleSeverity } from './utils'

/**
 * The native lint engine: `pickier-zig lint-batch` (packages/zig), which
 * lints TS/JS files on every core and reports exactly what the TypeScript
 * linter reports for them.
 *
 * The CLI hands it a run's code files only when every rule the run would
 * apply to them is one whose native port is verified identical
 * (NATIVE_RULES, checked by packages/zig/scripts/parity.ts). Anything else -
 * another rule, a custom plugin, --fix, a file the engine declines - stays on
 * the TypeScript path.
 */

/** Built-in checks and plugin rules whose native output matches TypeScript. */
export const NATIVE_RULES: ReadonlySet<string> = new Set<string>([])

/** Plugins whose rules can apply to a TS/JS file. */
const CODE_PLUGINS = new Set(['eslint', 'general', 'quality', 'pickier', 'style', 'regexp', 'ts', 'node', 'unused-imports', 'perfectionist'])

export interface NativeRequest {
  format: { quotes: 'single' | 'double', indent: number, indentStyle: 'spaces' | 'tabs' }
  builtins: Record<string, 'error' | 'warning' | null>
  rules: Array<{ id: string, severity: 'error' | 'warning' | null, options: unknown }>
}

/** What the run's settings ask of a code file, or every rule involved. */
export function nativeRequest(cfg: PickierConfig): { request: NativeRequest, ruleIds: string[] } {
  const builtins: NativeRequest['builtins'] = {
    'quotes': resolveRuleSeverity(cfg, 'quotes', ['style/quotes'], 'warn') ?? null,
    'indent': resolveRuleSeverity(cfg, 'indent', ['style/indent'], 'warn') ?? null,
    'no-debugger': resolveRuleSeverity(cfg, 'no-debugger', ['noDebugger']) ?? null,
    'no-console': resolveRuleSeverity(cfg, 'no-console', ['noConsole']) ?? null,
    'no-template-curly-in-string': resolveRuleSeverity(cfg, 'no-template-curly-in-string', ['noTemplateCurlyInString']) ?? null,
    'no-cond-assign': resolveRuleSeverity(cfg, 'no-cond-assign', ['noCondAssign']) ?? null,
  }
  const rules = plannedCheckRules(cfg)
    .filter(r => CODE_PLUGINS.has(r.plugin))
    .map(r => ({ id: r.id, severity: r.severity ?? null, options: r.options ?? null }))
  const ruleIds = [
    ...Object.entries(builtins).filter(([, sev]) => sev !== null).map(([id]) => id),
    ...rules.map(r => r.id),
  ]
  return {
    request: {
      format: { quotes: cfg.format.quotes, indent: cfg.format.indent, indentStyle: cfg.format.indentStyle ?? 'spaces' },
      builtins,
      rules,
    },
    ruleIds,
  }
}

/** The native binary: a build next to this package, or null when there is none. */
export function nativeBinary(): string | null {
  const candidates = [
    resolve(__dirname, '../../zig/zig-out/bin/pickier-zig'),
    resolve(__dirname, '../../../zig/zig-out/bin/pickier-zig'),
  ]
  return candidates.find(p => existsSync(p)) ?? null
}

/**
 * Lint `files` natively: one entry per file, null for a file the engine left
 * to the TypeScript linter. Null overall when the engine is unavailable or
 * declined the request.
 */
export function lintNative(files: string[], request: NativeRequest, binary: string, threads?: number): Array<LintIssue[] | null> | null {
  const input = JSON.stringify({ ...request, ...(threads && { threads }), files })
  const r = Bun.spawnSync([binary, 'lint-batch'], { stdin: Buffer.from(input), stdout: 'pipe', stderr: 'pipe' })
  if (r.exitCode !== 0)
    return null
  try {
    const out = JSON.parse(r.stdout.toString()) as Array<LintIssue[] | null>
    return out.length === files.length ? out : null
  }
  catch {
    return null
  }
}
