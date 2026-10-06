import { afterAll, afterEach, describe, expect, it } from 'bun:test'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { defaultConfig } from '../../src/config'
import { mergeIssues, nativeBinary, nativePlan } from '../../src/native'
import { getAllPlugins } from '../../src/plugins'

/**
 * The native engine (native.ts) lints TS/JS files for the CLI. Whatever it
 * does - run every rule, run some while TypeScript runs the rest, or fail -
 * the report must be exactly what a TypeScript-only run (PICKIER_NATIVE=0)
 * produces.
 */
const CLI = resolve(__dirname, '../../bin/cli.ts')
const root = mkdtempSync(join(tmpdir(), 'pickier-native-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const project = join(root, 'project')
mkdirSync(join(project, 'src'), { recursive: true })
const sources = [
  [
    `import { readFileSync, writeFileSync } from 'node:fs'`,
    `import { Buffer } from 'node:buffer'`,
    `let count = 1;   let other = 2`,
    `var legacy = "double"`,
    `export const b = 2`,
    `export const a = 1`,
    `new Thing()`,
    `if (count == 2) { debugger }`,
    `const re = /a  b/`,
    `console.log('x' + count, \`\${other}\`, '\${not}', readFileSync)`,
    ``,
    ``,
    `function f(unused) {`,
    `    return 1 `,
    `}`,
    `// eslint-disable-next-line no-console`,
    `console.log(Buffer)`,
    ``,
  ],
  [
    `export function g(x: number) { if (x) { return x } else { return 0 } }`,
    `const items = [1,2,3].map(n => n * 2)`,
    `while (x = next()) {}`,
    `const s = 'it\\'s' + "mixed"`,
    `export { items }`,
    ``,
  ],
]
for (let i = 0; i < 12; i++)
  writeFileSync(join(project, 'src', `file-${i}.ts`), sources[i % sources.length]!.join('\n'))
writeFileSync(join(project, 'README.md'), '# Title\n\nSome  text \n')

// Every rule a code file can run, on - most have no native port
const allRules = join(root, 'all-rules.json')
const code = new Set(['eslint', 'general', 'quality', 'pickier', 'style', 'regexp', 'ts', 'node', 'unused-imports', 'perfectionist'])
const pluginRules: Record<string, string> = {}
for (const p of getAllPlugins()) {
  if (code.has(p.name)) {
    for (const r of Object.keys(p.rules)) pluginRules[`${p.name}/${r}`] = 'warn'
  }
}
writeFileSync(allRules, JSON.stringify({ pluginRules }))

function run(env: Record<string, string>, ...args: string[]): { out: string, code: number } {
  const out = join(root, `out-${Math.random().toString(36).slice(2)}.json`)
  // JSON to a file, not a pipe: the process can exit before a pipe drains
  const r = Bun.spawnSync(['sh', '-c', `bun ${CLI} run . --mode lint --reporter json ${args.join(' ')} > ${out}`], {
    cwd: project,
    env: { ...process.env, ...env },
  })
  return { out: readFileSync(out, 'utf8'), code: r.exitCode }
}

// A stand-in engine: `body` is the shell script that runs as `lint-batch`
function fakeEngine(name: string, body: string): string {
  const path = join(root, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

describe('the native engine is optional', () => {
  const typescript = run({ PICKIER_NATIVE: '0' })

  it('reports issues on the TypeScript path', () => {
    expect(JSON.parse(typescript.out).issues.length).toBeGreaterThan(20)
  })

  const broken: Record<string, string> = {
    'fails': 'cat > /dev/null\nexit 1',
    'prints nonsense': 'cat > /dev/null\necho "not json"',
    'speaks an older protocol': 'cat > /dev/null\necho \'[{"s":[],"i":[]}]\'',
    'speaks a newer protocol': 'cat > /dev/null\necho \'{"v":99,"f":[]}\'',
  }
  for (const [what, body] of Object.entries(broken)) {
    it(`falls back to TypeScript when the engine ${what}`, () => {
      const engine = fakeEngine(what.replaceAll(' ', '-'), body)
      const r = run({ PICKIER_NATIVE_BINARY: engine })
      expect(r.out).toBe(typescript.out)
      expect(r.code).toBe(typescript.code)
    })
  }
})

const binary = nativeBinary()
describe.skipIf(!binary)('with the engine built', () => {
  // A wrapper that notes each run, to show the engine took part
  const marker = join(root, 'engine-ran')
  const wrapper = fakeEngine('wrapper', `touch ${marker}\nexec ${binary} "$@"`)
  afterEach(() => rmSync(marker, { force: true }))

  it('reports what TypeScript reports under the default rules', () => {
    const typescript = run({ PICKIER_NATIVE: '0' })
    const native = run({ PICKIER_NATIVE_BINARY: wrapper })
    expect(existsSync(marker)).toBe(true)
    expect(native.out).toBe(typescript.out)
    expect(native.code).toBe(typescript.code)
  })

  it('reports what TypeScript reports when it runs only some of the rules', () => {
    const typescript = run({ PICKIER_NATIVE: '0' }, '--config', allRules)
    const hybrid = run({ PICKIER_NATIVE_BINARY: wrapper }, '--config', allRules)
    expect(existsSync(marker)).toBe(true)
    expect(JSON.parse(typescript.out).issues.length).toBeGreaterThan(JSON.parse(run({ PICKIER_NATIVE: '0' }).out).issues.length)
    expect(hybrid.out).toBe(typescript.out)
    expect(hybrid.code).toBe(typescript.code)
  })
})

describe('nativePlan', () => {
  const saved = process.env.PICKIER_NATIVE_BINARY
  afterEach(() => {
    if (saved === undefined)
      delete process.env.PICKIER_NATIVE_BINARY
    else
      process.env.PICKIER_NATIVE_BINARY = saved
  })
  const withEngine = () => {
    process.env.PICKIER_NATIVE_BINARY = fakeEngine('plan-engine', 'exit 0')
  }

  it('runs every default rule natively', () => {
    withEngine()
    const plan = nativePlan(structuredClone(defaultConfig), {})!
    expect(plan.hybrid).toBe(false)
    expect(plan.nativeRules).toContain('general/no-unused-vars')
  })

  it('leaves rules without a port to TypeScript, keeping plan positions', () => {
    withEngine()
    const cfg = structuredClone(defaultConfig)
    cfg.pluginRules = { ...cfg.pluginRules, 'eslint/eqeqeq': 'warn' }
    const plan = nativePlan(cfg, {})!
    expect(plan.hybrid).toBe(true)
    expect(plan.nativeRules).not.toContain('eslint/eqeqeq')
    expect(plan.positions.length).toBe(plan.nativeRules.length)
    expect([...plan.positions].sort((a, b) => a - b)).toEqual(plan.positions)
  })

  it('stays out of runs it cannot reproduce', () => {
    withEngine()
    expect(nativePlan(structuredClone(defaultConfig), { fix: true })).toBeNull()
    const shadowed = structuredClone(defaultConfig)
    shadowed.plugins = [{ name: 'style', rules: {} }]
    expect(nativePlan(shadowed, {})).toBeNull()
    process.env.PICKIER_NATIVE_BINARY = join(root, 'missing')
    expect(nativePlan(structuredClone(defaultConfig), {})).toBeNull()
  })
})

describe('mergeIssues', () => {
  const issue = (pos: number, line: number, ruleId: string) => ({ filePath: 'f.ts', line, column: 1, ruleId, message: ruleId, severity: 'warning' as const, pos })

  it('orders issues by plan position, built-in checks first', () => {
    const native = [issue(-1, 9, 'quotes'), issue(0, 5, 'a'), issue(3, 1, 'd')]
    const typescript = [issue(1, 7, 'b'), issue(2, 2, 'c'), issue(4, 1, 'e')]
    expect(mergeIssues(native, typescript).map(i => i.ruleId)).toEqual(['quotes', 'a', 'b', 'c', 'd', 'e'])
  })

  it('keeps the first of issues at the same place for the same rule id', () => {
    const native = [issue(2, 1, 'x')]
    const typescript = [issue(1, 1, 'x'), issue(3, 1, 'x'), issue(3, 2, 'x')]
    const merged = mergeIssues(native, typescript)
    expect(merged.map(i => `${i.line}`)).toEqual(['1', '2'])
    expect(merged.every(i => !('pos' in i))).toBe(true)
  })
})
