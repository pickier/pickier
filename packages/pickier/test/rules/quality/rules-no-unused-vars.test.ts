import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noUnusedVarsRule } from '../../../src/rules/general/no-unused-vars'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-rule-unused-vars-'))
}

describe('general/no-unused-vars', () => {
  it('flags unused variable with default pattern ^_', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = 'const conds = 1\nconsole.log(1)'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('does not flag variables matching ignore pattern', async () => {
    const dir = tmp()
    const file = 'b.ts'
    const src = 'const _conds = 1;'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': ['error', { varsIgnorePattern: '^_' }], 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('flags unused function parameters unless ignored by pattern', async () => {
    const dir = tmp()
    const file = 'c.ts'
    const src = 'function f(conds, _ignored) {\n  return 1\n}\nconst g = (_a, b) => {\n  return b\n}\nconst h = (x) => x'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('does not flag single-parameter arrow function when parameter is used', async () => {
    const dir = tmp()
    const file = 'd.ts'
    const src = 'const f = x => x + 1\nf(1)'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('flags single-parameter arrow function when parameter is unused', async () => {
    const dir = tmp()
    const file = 'e.ts'
    const src = 'const f = x => 42\n;f(1)\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('respects argsIgnorePattern for single-parameter arrow functions', async () => {
    const dir = tmp()
    const file = 'f.ts'
    const src = 'const f = _x => 1\n;f(1)\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not flag TypeScript generic type parameters as unused variables', async () => {
    const dir = tmp()
    const file = 'g.ts'
    // Test case: commas inside generic type parameters should not be treated as variable separators
    const src = 'const timers = new Map<string, NodeJS.Timeout>()\nsetTimeout(() => timers.clear(), 100)\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0) // Should pass - NodeJS is a type, not an unused variable
  })

  it('does not flag variables when commas appear inside string literals', async () => {
    const dir = tmp()
    const file = 'h.ts'
    // Test case: commas inside strings should not be treated as variable separators
    const src = 'const description = \'Format, lint, and more\'\nconsole.log(description)\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not flag parameters when braces appear inside string literals', async () => {
    const dir = tmp()
    const file = 'i.ts'
    // Test case: braces inside strings should not confuse function body detection
    const src = 'function check(line: string) {\n  if (line.includes(\'{\')) return true\n  return false\n}\ncheck("test")\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles TypeScript return type annotations in arrow functions', async () => {
    const dir = tmp()
    const file = 'j.ts'
    // Test case: return type annotations should not break arrow function detection
    const src = 'const getName = (obj: any): string => obj.name\nconsole.log(getName({name: "test"}))\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('distinguishes object literals from function bodies in arrow functions', async () => {
    const dir = tmp()
    const file = 'k.ts'
    // Test case: object literal braces should not be confused with function body braces
    const src = 'const makeObj = (a: number, b: number) => ({ sum: a + b })\nconsole.log(makeObj(1, 2))\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('ignores arrow functions in comments', async () => {
    const dir = tmp()
    const file = 'l.ts'
    // Test case: arrow functions in comments should not be detected
    const src = '// Example: const fn = (a, b) => a + b\nconst realFn = (x: number) => x * 2\nconsole.log(realFn(5))\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('ignores arrow operators in regex literals', async () => {
    const dir = tmp()
    const file = 'm.ts'
    // Test case: => inside regex should not be matched as arrow function
    const src = 'function check(text: string) {\n  if (/^\\(?[A-Z_$,]*(?:\\)\\s*)?=>/i.test(text)) return true\n  return false\n}\ncheck("test")\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles TypeScript generic type annotations with braces in function signatures', async () => {
    const dir = tmp()
    const file = 'n.ts'
    // Test case: braces inside generic type annotations should not confuse body detection
    const src = 'function validate(data: Array<{ line: number, message: string }>) {\n  return data.length > 0\n}\nvalidate([])\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles default parameter values with strings containing special chars', async () => {
    const dir = tmp()
    const file = 'o.ts'
    // Test case: default values with strings containing hyphens should not create false positives
    const src = 'function createDir(prefix = \'pickier-test-\') {\n  return prefix + Date.now()\n}\ncreateDir()\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles default parameter values with objects', async () => {
    const dir = tmp()
    const file = 'p.ts'
    // Test case: default object values should be properly stripped
    const src = 'function init(opts = { key: \'value\', nested: { a: 1 } }) {\n  return opts.key\n}\ninit()\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles default parameter values with arrays', async () => {
    const dir = tmp()
    const file = 'q.ts'
    // Test case: default array values should be properly stripped
    const src = 'function process(items = [1, 2, 3]) {\n  return items.length\n}\nprocess()\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles default parameter values with arrow functions', async () => {
    const dir = tmp()
    const file = 'r.ts'
    // Test case: default function values should be properly stripped
    const src = 'function execute(fn = () => \'default\') {\n  return fn()\n}\nexecute()\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles object shorthand properties', async () => {
    const dir = tmp()
    const file = 's.ts'
    // Test case: object shorthand properties should correctly use the parameter
    const src = 'export function test(filePath: string): any {\n  const issues: any[] = []\n  issues.push({ filePath, line: 1 })\n  return issues\n}\ntest("file.ts")\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not flag type signature parameters in object type definitions', async () => {
    const dir = tmp()
    const file = 'u.ts'
    // Test case: type signatures should not be checked as function parameters
    const src = 'export const colors: {\n  green: (text: string) => string\n  red: (text: string) => string\n} = {\n  green: (t) => t,\n  red: (t) => t,\n}\ncolors.green("hi")\n'
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  describe('fix: prefix unused function params with _', () => {
    it('prefixes a single unused parameter', () => {
      const src = 'function f(a: number) { return 1 }\n'
      const out = noUnusedVarsRule.fix!(src, { filePath: 'a.ts', config: {} as any })
      expect(out).toBe('function f(_a: number) { return 1 }\n')
    })

    it('prefixes multiple unused params on the same line', () => {
      const src = 'function f(a: number, b: string) { return 1 }\n'
      const out = noUnusedVarsRule.fix!(src, { filePath: 'a.ts', config: {} as any })
      expect(out).toBe('function f(_a: number, _b: string) { return 1 }\n')
    })

    it('does not touch params that are used', () => {
      const src = 'function f(a: number) { return a }\n'
      const out = noUnusedVarsRule.fix!(src, { filePath: 'a.ts', config: {} as any })
      expect(out).toBe(src)
    })

    it('does not touch already-prefixed params', () => {
      const src = 'function f(_a: number) { return 1 }\n'
      const out = noUnusedVarsRule.fix!(src, { filePath: 'a.ts', config: {} as any })
      expect(out).toBe(src)
    })

    it('does not flag param names in TypeScript function-type signatures (regression: stx desktop)', () => {
      // None of the parameter names below are real bindings — they're
      // documentation in function-TYPE expressions. `pickier/no-unused-vars`
      // used to false-flag every one of them, fix would happily prefix with
      // `_`, and the resulting type was identical (since the names don't
      // matter) but visually corrupted. See the stx packages/desktop CI run
      // that triggered https://github.com/pickier/pickier/issues for these
      // exact patterns.
      const src = [
        'type RedactFn = (entry: StoredCrashEntry) => StoredCrashEntry',
        'interface Bridge {',
        '  install: (ns: string, method: string, response: unknown | ((...args: unknown[]) => unknown)) => void',
        '}',
        'const responses = new Map<string, unknown | ((...args: unknown[]) => unknown)>()',
        'const _r = ((1 as unknown) as (...a: unknown[]) => unknown)(1, 2)',
        'const opts: { redact?: boolean | ((entry: StoredCrashEntry) => StoredCrashEntry) } = {}',
        '',
      ].join('\n')
      const issues = noUnusedVarsRule.check(src, { filePath: 'a.ts', config: {} as any })
      const paramIssues = issues.filter(i => i.message.includes('(function parameter)'))
      expect(paramIssues).toEqual([])
    })

    it('STILL flags real unused params in actual function declarations', () => {
      // Sanity-check that the type-signature exemption doesn't accidentally
      // silence the rule for real declarations.
      const src = 'export function f(a: number, b: string) { return 1 }\n'
      const issues = noUnusedVarsRule.check(src, { filePath: 'a.ts', config: {} as any })
      const paramIssues = issues.filter(i => i.message.includes('(function parameter)'))
      expect(paramIssues.length).toBe(2)
    })

    it('does not modify function() inside a template literal body (regression: bunpress serve.ts)', () => {
      // Real-world repro: regex literal earlier in the file contained
      // `"`, which used to break template-literal tracking and cause
      // false positives for function() patterns inside an injected
      // <script> string. The check must skip these lines so the fix
      // doesn't rewrite param names whose body usages live in the same
      // template string.
      const src = [
        'function parseId(s: string) {',
        '  const idMatch = s.match(/id="([^"]*)"/)',
        '  return idMatch ? idMatch[1] : \'\'',
        '}',
        '',
        'function script(): string {',
        '  return `<script>',
        '    document.querySelectorAll(\'a[href]\').forEach(function(a) {',
        '      var href = a.getAttribute(\'href\');',
        '      console.log(href);',
        '    });',
        '  </script>`',
        '}',
        '',
      ].join('\n')
      const out = noUnusedVarsRule.fix!(src, { filePath: 'a.ts', config: {} as any })
      expect(out).toBe(src)
    })
  })
})
