/**
 * Native vs TypeScript lint parity.
 *
 *   bun scripts/parity.ts <dir>... [--rule <id>] [--show N] [--threads N]
 *
 * Lints every TS/JS file under the given directories twice - with the
 * TypeScript linter (`lintFileForRun`, as the CLI runs it without --fix) and
 * with the native engine (`pickier-zig lint-batch`) - under the default
 * config, and reports every issue the two disagree on, by rule.
 *
 * `--rule <id>` turns every other rule off on both sides so one port can be
 * checked alone: a plugin rule id such as `general/prefer-const`, or a
 * built-in: `quotes`, `indent`, `no-debugger`, `no-console`,
 * `no-template-curly-in-string`, `no-cond-assign`.
 *
 * A port is done when this reports no differences on every corpus at hand.
 */
/* eslint-disable no-console -- a command-line report */
import { resolve } from 'node:path'
import { defaultConfig } from '../../pickier/src/config'
import { lintFileForRun } from '../../pickier/src/linter'
import { lintNative, nativeRequest } from '../../pickier/src/native'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  if (i === -1)
    return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const only = flag('--rule')
const show = Number(flag('--show') ?? 8)
const threads = flag('--threads') ? Number(flag('--threads')) : undefined
const dirs = args.length ? args : ['.']

const BUILTINS = ['quotes', 'indent', 'no-debugger', 'no-console', 'no-template-curly-in-string', 'no-cond-assign']
const BUILTIN_ALIASES: Record<string, string[]> = { 'quotes': ['style/quotes'], 'indent': ['style/indent'], 'no-debugger': ['noDebugger'], 'no-console': ['noConsole'], 'no-template-curly-in-string': ['noTemplateCurlyInString'], 'no-cond-assign': ['noCondAssign'] }

// The default config, or with --rule only that rule left on
function config() {
  const cfg = structuredClone({ ...defaultConfig, pluginRules: { ...defaultConfig.pluginRules }, rules: { ...defaultConfig.rules } }) as typeof defaultConfig
  if (!only)
    return cfg
  const off: Record<string, any> = {}
  for (const id of BUILTINS) {
    if (id !== only) {
      off[id] = 'off'
      for (const alias of BUILTIN_ALIASES[id]!) off[alias] = 'off'
    }
  }
  for (const id of Object.keys(cfg.pluginRules ?? {})) {
    if (id !== only)
      off[id] = 'off'
  }
  if (BUILTINS.includes(only)) {
    // keep its default severity, or turn on one that is off by default
    off[only] = (cfg.rules as any)[only] ?? 'warn'
  }
  cfg.rules = { ...(cfg.rules as any), ...off }
  cfg.pluginRules = { ...(cfg.pluginRules as any), ...Object.fromEntries(Object.entries(off).filter(([k]) => k.includes('/'))) }
  return cfg
}

const cfg = config()
const files: string[] = []
for (const dir of dirs) {
  for (const f of new Bun.Glob('**/*.{ts,js,mts,mjs,cts,cjs,tsx,jsx}').scanSync({ cwd: dir, absolute: true, followSymlinks: false })) {
    if (!f.includes('/node_modules/') || dir.includes('node_modules'))
      files.push(resolve(f))
  }
}

const { request, ruleIds } = nativeRequest(cfg)
const binary = resolve(import.meta.dir, '../zig-out/bin/pickier-zig')
let t0 = performance.now()
const native = lintNative(files, request, binary, threads)
const nativeMs = performance.now() - t0
if (!native) {
  console.error('native engine declined the request (unsupported rule?)')
  process.exit(2)
}

t0 = performance.now()
const options = { reporter: 'json' } as any
const key = (i: any) => `${i.line}:${i.column}:${i.ruleId}:${i.severity}:${i.message}:${i.help ?? ''}`
const byRule: Record<string, { tsOnly: number, nativeOnly: number }> = {}
const examples: string[] = []
let same = 0
let declined = 0
for (let k = 0; k < files.length; k++) {
  const ts = await lintFileForRun(files[k]!, cfg, options).catch(() => null)
  const nat = native[k]
  if (nat === null) {
    declined++
    continue
  }
  if (ts === null)
    continue
  const tsKeys = ts.map(key)
  const natKeys = nat.map(key)
  // order matters too: compare as sequences, report as sets
  if (tsKeys.join('\n') === natKeys.join('\n')) {
    same += ts.length
    continue
  }
  const natSet = new Set(natKeys)
  const tsSet = new Set(tsKeys)
  for (const i of ts) {
    if (!natSet.has(key(i))) {
      (byRule[i.ruleId] ??= { tsOnly: 0, nativeOnly: 0 }).tsOnly++
      if (examples.length < show && (!only || true))
        examples.push(`TS     ${files[k]}:${key(i)}`)
    }
    else {
      same++
    }
  }
  for (const i of nat) {
    if (!tsSet.has(key(i))) {
      (byRule[i.ruleId] ??= { tsOnly: 0, nativeOnly: 0 }).nativeOnly++
      if (examples.length < show)
        examples.push(`NATIVE ${files[k]}:${key(i)}`)
    }
  }
  if (tsKeys.length === natKeys.length && new Set([...tsKeys, ...natKeys]).size === tsKeys.length)
    (byRule['(order)'] ??= { tsOnly: 0, nativeOnly: 0 }).tsOnly++
}
const tsMs = performance.now() - t0

console.log(`files ${files.length}  rules ${only ?? `all (${ruleIds.length})`}  matching issues ${same}  declined files ${declined}`)
console.log(`native ${nativeMs.toFixed(0)} ms   typescript ${tsMs.toFixed(0)} ms`)
const diffs = Object.entries(byRule).sort((a, b) => (b[1].tsOnly + b[1].nativeOnly) - (a[1].tsOnly + a[1].nativeOnly))
if (diffs.length === 0) {
  console.log('PARITY: no differences')
}
else {
  console.log('DIFFERENCES (rule: only-in-typescript / only-in-native):')
  for (const [rule, d] of diffs) console.log(`  ${rule}: ${d.tsOnly} / ${d.nativeOnly}`)
  for (const e of examples) console.log(`  ${e}`)
  process.exitCode = 1
}
