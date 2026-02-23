import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-unused-vars-adv-'))
}

function makeConfig(dir: string): string {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    plugins: [{ name: 'pickier', rules: {} }],
    pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off', 'pickier/prefer-const': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('no-unused-vars advanced coverage', () => {
  describe('arrow function params', () => {
    it('does not flag used arrow function params', async () => {
      const dir = tmp()
      const src = [
        'const arr = [1, 2, 3]',
        'const doubled = arr.map(x => x * 2)',
        'console.log(doubled)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('flags unused arrow function params', async () => {
      const dir = tmp()
      const src = [
        'const arr = [1, 2, 3]',
        'const result = arr.map(unused => 42)',
        'console.log(result)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1)
    })

    it('ignores underscore-prefixed arrow params', async () => {
      const dir = tmp()
      const src = [
        'const arr = [1, 2, 3]',
        'const result = arr.map(_x => 42)',
        'console.log(result)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles multi-param arrow functions', async () => {
      const dir = tmp()
      const src = [
        'const obj = { a: 1, b: 2 }',
        'const entries = Object.entries(obj)',
        'const result = entries.reduce((acc, [key, val]) => ({ ...acc, [key]: val * 2 }), {} as any)',
        'console.log(result)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('class and method params', () => {
    it('does not flag used class method params', async () => {
      const dir = tmp()
      const src = [
        'class Foo {',
        '  greet(name: string) {',
        '    return `Hello ${name}`',
        '  }',
        '}',
        'const f = new Foo()',
        'console.log(f.greet("world"))',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('type annotations in params', () => {
    it('handles params with complex type annotations', async () => {
      const dir = tmp()
      const src = [
        'function process(data: Array<{ id: number; name: string }>) {',
        '  return data.map(item => item.name)',
        '}',
        'process([{ id: 1, name: "test" }])',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles params with generic type annotations', async () => {
      const dir = tmp()
      const src = [
        'function identity<T>(value: T): T {',
        '  return value',
        '}',
        'identity(42)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('variable declarations', () => {
    it('flags unused const declarations', async () => {
      const dir = tmp()
      const src = [
        'const unused = 42',
        'console.log("done")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1)
    })

    it('does not flag used const declarations', async () => {
      const dir = tmp()
      const src = [
        'const value = 42',
        'console.log(value)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('ignores underscore-prefixed variables', async () => {
      const dir = tmp()
      const src = [
        'const _unused = 42',
        'console.log("done")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles object destructuring', async () => {
      const dir = tmp()
      const src = [
        'const { a, b } = { a: 1, b: 2 }',
        'console.log(a, b)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles array destructuring', async () => {
      const dir = tmp()
      const src = [
        'const [first, second] = [1, 2]',
        'console.log(first, second)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('import declarations', () => {
    it('does not flag used imports', async () => {
      const dir = tmp()
      const src = [
        "import { join } from 'node:path'",
        "const p = join('/a', 'b')",
        'console.log(p)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles type-only imports', async () => {
      const dir = tmp()
      const src = [
        "import type { LintIssue } from './types'",
        'const issues: LintIssue[] = []',
        'console.log(issues)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('export declarations', () => {
    it('does not flag exported functions', async () => {
      const dir = tmp()
      const src = [
        'export function helper(x: number) {',
        '  return x * 2',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('does not flag exported const', async () => {
      const dir = tmp()
      const src = [
        'export const VERSION = "1.0.0"',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('varsIgnorePattern option', () => {
    it('respects custom varsIgnorePattern', async () => {
      const dir = tmp()
      const cfgPath = join(dir, 'pickier.config.json')
      writeFileSync(cfgPath, JSON.stringify({
        verbose: false,
        ignores: [],
        lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
        format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
        rules: { noDebugger: 'off', noConsole: 'off' },
        pluginRules: {
          'general/no-unused-vars': ['error', { varsIgnorePattern: '^ignore' }],
          'style/max-statements-per-line': 'off',
          'pickier/prefer-const': 'off',
        },
      }, null, 2), 'utf8')
      const src = [
        'const ignoreMe = 42',
        'console.log("done")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
      expect(code).toBe(0)
    })
  })
})
