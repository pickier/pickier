import type { LintIssue, LintOptions, PickierConfig } from './types'
import { chmodSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { plannedCheckRules } from './linter'
import { resolveRuleSeverity } from './utils'

/**
 * The native lint engine: `pickier-zig lint-batch` (packages/zig), which
 * lints TS/JS files on every core and reports exactly what the TypeScript
 * linter reports for them.
 *
 * A run's code files go to it whenever it can take part: it runs the built-in
 * checks and every rule whose native port is verified identical (NATIVE_RULES,
 * checked by packages/zig/scripts/parity.ts), and the TypeScript linter runs
 * whatever rules are left on the same files at the same time; the two sets of
 * issues are merged in the order a TypeScript-only run reports them. --fix,
 * formatting and files the engine declines stay on the TypeScript path.
 */

/** Built-in checks and plugin rules whose native output matches TypeScript. */
export const NATIVE_RULES: ReadonlySet<string> = new Set<string>([
  // built-in checks
  'quotes',
  'indent',
  'no-debugger',
  'no-console',
  'no-template-curly-in-string',
  'no-cond-assign',
  // plugin rules
  'pickier/import-dedupe',
  'pickier/no-import-dist',
  'pickier/no-import-node-modules-by-path',
  'pickier/sort-tailwind-classes',
  'style/brace-style',
  'style/max-statements-per-line',
  'regexp/no-super-linear-backtracking',
  'regexp/no-unused-capturing-group',
  'regexp/no-useless-lazy',
  'general/prefer-const',
  'general/prefer-template',
  'general/no-unused-vars',
  'pickier/no-unused-imports',
  'ts/no-top-level-await',
  'style/no-multi-spaces',
  'style/no-multiple-empty-lines',
  'style/no-trailing-spaces',
  'eslint/no-new',
  'quality/no-new',
  'general/no-new',
  'general/no-regex-spaces',
  'node/prefer-global/buffer',
  'node/prefer-global/process',
  'pickier/sort-exports',
])

/** Plugins whose rules can apply to a TS/JS file. */
const CODE_PLUGINS = new Set(['eslint', 'general', 'quality', 'pickier', 'style', 'regexp', 'ts', 'node', 'unused-imports', 'perfectionist'])

/**
 * Plugins whose rules never apply to a file the engine lints: Markdown,
 * package.json and lockfile rules, and shell rules (a shell shebang makes
 * the engine decline the file).
 */
const NON_CODE_PLUGINS = new Set(['markdown', 'publint', 'lockfile', 'shell'])

export interface NativeRequest {
  format: { quotes: 'single' | 'double', indent: number, indentStyle: 'spaces' | 'tabs' }
  builtins: Record<string, 'error' | 'warning' | null>
  rules: Array<{ id: string, severity: 'error' | 'warning' | null, options: unknown }>
}

/**
 * Rules that read their options from the config instead of their plan entry:
 * the engine is sent what the TypeScript rule reads.
 */
const CONFIG_OPTIONS: Record<string, (cfg: PickierConfig) => unknown> = {
  'pickier/sort-exports': cfg => (cfg.pluginRules?.['pickier/sort-exports'] as any)?.[1] || {},
}

function ruleSetting(cfg: PickierConfig, r: { id: string, severity?: 'error' | 'warning', options?: unknown }): NativeRequest['rules'][number] {
  const options = CONFIG_OPTIONS[r.id] ? CONFIG_OPTIONS[r.id]!(cfg) : r.options
  return { id: r.id, severity: r.severity ?? null, options: options ?? null }
}

function builtinSeverities(cfg: PickierConfig): NativeRequest['builtins'] {
  return {
    'quotes': resolveRuleSeverity(cfg, 'quotes', ['style/quotes'], 'warn') ?? null,
    'indent': resolveRuleSeverity(cfg, 'indent', ['style/indent'], 'warn') ?? null,
    'no-debugger': resolveRuleSeverity(cfg, 'no-debugger', ['noDebugger']) ?? null,
    'no-console': resolveRuleSeverity(cfg, 'no-console', ['noConsole']) ?? null,
    'no-template-curly-in-string': resolveRuleSeverity(cfg, 'no-template-curly-in-string', ['noTemplateCurlyInString']) ?? null,
    'no-cond-assign': resolveRuleSeverity(cfg, 'no-cond-assign', ['noCondAssign']) ?? null,
  }
}

function formatSettings(cfg: PickierConfig): NativeRequest['format'] {
  return { quotes: cfg.format.quotes, indent: cfg.format.indent, indentStyle: cfg.format.indentStyle ?? 'spaces' }
}

/** What the run's settings ask of a code file, or every rule involved. */
export function nativeRequest(cfg: PickierConfig): { request: NativeRequest, ruleIds: string[] } {
  const builtins = builtinSeverities(cfg)
  const rules = plannedCheckRules(cfg)
    .filter(r => CODE_PLUGINS.has(r.plugin))
    .map(r => ruleSetting(cfg, r))
  const ruleIds = [
    ...Object.entries(builtins).filter(([, sev]) => sev !== null).map(([id]) => id),
    ...rules.map(r => r.id),
  ]
  return { request: { format: formatSettings(cfg), builtins, rules }, ruleIds }
}

/** Files the native engine lints: what the TypeScript linter treats as code. */
export function isNativeFile(path: string): boolean {
  return /\.(?:ts|js|tsx|jsx|mts|mjs|cts|cjs)$/.test(path)
}

export interface NativePlan {
  request: NativeRequest
  binary: string
  /** Each request rule's position in the run's rule plan */
  positions: number[]
  /** Plan ids of the rules the engine runs */
  nativeRules: string[]
  /** Whether rules the engine does not run apply to its files too */
  hybrid: boolean
}

/**
 * How the native engine takes part in a run, or null when it cannot: no
 * binary, a run that fixes or formats, PICKIER_NATIVE=0, a custom plugin
 * under a built-in plugin's name, or no rule it runs.
 */
export function nativePlan(cfg: PickierConfig, options: LintOptions): NativePlan | null {
  if (process.env.PICKIER_NATIVE === '0' || options.fix || options._formatOnly)
    return null
  // A plugin given by module name, or one reusing a built-in plugin's name,
  // could stand in for a rule the engine would run.
  if ((cfg.plugins ?? []).some(p => typeof p === 'string' || CODE_PLUGINS.has(p.name) || NON_CODE_PLUGINS.has(p.name)))
    return null
  const binary = nativeBinary()
  if (!binary)
    return null

  const builtins = builtinSeverities(cfg)
  const rules: NativeRequest['rules'] = []
  const positions: number[] = []
  let hybrid = false
  plannedCheckRules(cfg).forEach((r, position) => {
    if (CODE_PLUGINS.has(r.plugin) && NATIVE_RULES.has(r.id)) {
      rules.push(ruleSetting(cfg, r))
      positions.push(position)
    }
    else if (!NON_CODE_PLUGINS.has(r.plugin)) {
      hybrid = true
    }
  })
  if (rules.length === 0 && Object.values(builtins).every(sev => sev === null))
    return null
  return {
    request: { format: formatSettings(cfg), builtins, rules },
    binary,
    positions,
    nativeRules: rules.map(r => r.id),
    hybrid,
  }
}

/**
 * The native binary: $PICKIER_NATIVE_BINARY, the one shipped in this package
 * for this platform (dist/native/<platform>-<arch>, built by
 * scripts/build-native.ts), or a development build in packages/zig. Null when
 * there is none.
 */
export function nativeBinary(): string | null {
  if (process.env.PICKIER_NATIVE_BINARY)
    return existsSync(process.env.PICKIER_NATIVE_BINARY) ? process.env.PICKIER_NATIVE_BINARY : null
  const platform = `${process.platform}-${process.arch}`
  const exe = process.platform === 'win32' ? 'pickier-native.exe' : 'pickier-native'
  const candidates = [
    // from the bundle (dist/*.js) and from source (src/*.ts)
    resolve(__dirname, 'native', platform, exe),
    resolve(__dirname, '../dist/native', platform, exe),
    resolve(__dirname, '../../zig/zig-out/bin/pickier-zig'),
  ]
  return candidates.find(p => existsSync(p)) ?? null
}

/**
 * Lint `files` natively: one entry per file, null for a file the engine left
 * to the TypeScript linter. Null overall when the engine is unavailable or
 * declined the request.
 *
 * With `positions`, each issue also carries `pos`: its rule's position in the
 * run's plan (-1 for a built-in check), for mergeIssues.
 */
export function lintNative(files: string[], request: NativeRequest, binary: string, threads?: number, positions?: number[]): Array<LintIssue[] | null> | null {
  const input = Buffer.from(nativeInput(files, request, threads))
  const r = startable(binary, () => Bun.spawnSync([binary, 'lint-batch'], { stdin: input, stdout: 'pipe', stderr: 'pipe' }))
  if (!r || r.exitCode !== 0)
    return null
  return decodeNative(r.stdout.toString(), files, positions)
}

/** lintNative, leaving this thread free while the engine runs. */
export async function lintNativeAsync(files: string[], request: NativeRequest, binary: string, positions?: number[]): Promise<Array<LintIssue[] | null> | null> {
  const input = Buffer.from(nativeInput(files, request))
  const proc = startable(binary, () => Bun.spawn([binary, 'lint-batch'], { stdin: input, stdout: 'pipe', stderr: 'ignore' }))
  if (!proc)
    return null
  const [out, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  if (exitCode !== 0)
    return null
  return decodeNative(out, files, positions)
}

/**
 * Start the engine, or null when it cannot be started - the run then lints
 * on the TypeScript path. A package manager that unpacked the binary without
 * its executable bit gets it back once.
 */
function startable<T>(binary: string, spawn: () => T): T | null {
  try {
    return spawn()
  }
  catch (e: any) {
    if (e?.code !== 'EACCES')
      return null
    try {
      chmodSync(binary, 0o755)
      return spawn()
    }
    catch {
      return null
    }
  }
}

function nativeInput(files: string[], request: NativeRequest, threads?: number): string {
  return JSON.stringify({ ...request, ...(threads && { threads }), files })
}

/** The engine output format this decoder reads (batch.zig `protocol_version`). */
const PROTOCOL_VERSION = 2

function decodeNative(json: string, files: string[], positions?: number[]): Array<LintIssue[] | null> | null {
  let out: Array<{ s: string[], i: number[] } | null>
  try {
    const parsed = JSON.parse(json)
    // An engine built from another version of this package
    if (parsed?.v !== PROTOCOL_VERSION)
      return null
    out = parsed.f
  }
  catch {
    return null
  }
  if (!Array.isArray(out) || out.length !== files.length)
    return null
  // Each issue is seven numbers: line, column, then indexes into the file's
  // strings for ruleId and message, severity (0 error, 1 warning), help (-1
  // for none) and the rule's index in the request (-1 for a built-in check) -
  // built back into the issue objects the linter makes.
  return out.map((file, f) => {
    if (file === null)
      return null
    const { s: strings, i: n } = file
    const filePath = files[f]!
    const issues: LintIssue[] = []
    for (let k = 0; k < n.length; k += 7) {
      const issue: LintIssue = {
        filePath,
        line: n[k]!,
        column: n[k + 1]!,
        ruleId: strings[n[k + 2]!]!,
        message: strings[n[k + 3]!]!,
        severity: n[k + 4] === 0 ? 'error' : 'warning',
      }
      if (n[k + 5]! >= 0)
        issue.help = strings[n[k + 5]!]
      if (positions)
        (issue as PlannedIssue).pos = n[k + 6]! < 0 ? -1 : positions[n[k + 6]!]!
      issues.push(issue)
    }
    return issues
  })
}

/** An issue with its rule's position in the run's plan (-1: a built-in check). */
export type PlannedIssue = LintIssue & { pos: number }

/**
 * One file's issues from the engine and from the TypeScript linter's run of
 * the remaining rules, as a TypeScript-only run reports them: built-in checks
 * first, then each rule's issues in plan order, the first of any with the same
 * line, column and rule kept.
 */
export function mergeIssues(native: LintIssue[], typescript: LintIssue[]): LintIssue[] {
  const a = native as PlannedIssue[]
  const b = typescript as PlannedIssue[]
  const merged: LintIssue[] = []
  const seen = new Set<string>()
  const add = (planned: PlannedIssue) => {
    const key = `${planned.line}:${planned.column}:${planned.ruleId}`
    if (seen.has(key))
      return
    seen.add(key)
    // The issue as the linter makes it, without its plan position
    const issue: LintIssue = { filePath: planned.filePath, line: planned.line, column: planned.column, ruleId: planned.ruleId, message: planned.message, severity: planned.severity }
    if (planned.help !== undefined)
      issue.help = planned.help
    merged.push(issue)
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i]!.pos <= b[j]!.pos))
      add(a[i++]!)
    else
      add(b[j++]!)
  }
  return merged
}
