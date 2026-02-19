import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-unused-vars-edge-'))
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

describe('no-unused-vars edge cases (regression tests)', () => {
  describe('destructuring alias handling', () => {
    it('does not flag property keys in destructuring aliases (only flags the alias value)', async () => {
      const dir = tmp()
      // { logicalId: eipLogicalId } — only eipLogicalId is a variable, not logicalId
      const src = [
        'const obj = { logicalId: "test", value: 42 }',
        'const { logicalId: eipLogicalId } = obj',
        'console.log(eipLogicalId)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('flags unused alias values in destructuring', async () => {
      const dir = tmp()
      const src = [
        'const obj = { logicalId: "test" }',
        'const { logicalId: eipLogicalId } = obj',
        'console.log("done")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1) // eipLogicalId is unused
    })

    it('handles rest elements in destructuring', async () => {
      const dir = tmp()
      const src = [
        'const arr = [1, 2, 3, 4, 5]',
        'const [_first, ...rest] = arr',
        'console.log(rest)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // rest is used, _first is ignored
    })

    it('handles multiple aliases in destructuring', async () => {
      const dir = tmp()
      const src = [
        'const config = { host: "localhost", port: 3000 }',
        'const { host: serverHost, port: serverPort } = config',
        'console.log(serverHost, serverPort)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // both aliases are used
    })

    it('handles alias with default value in destructuring', async () => {
      const dir = tmp()
      const src = [
        'const opts = {} as any',
        'const { timeout: requestTimeout = 5000 } = opts',
        'console.log(requestTimeout)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // requestTimeout is used
    })
  })

  describe('multi-line return type annotations', () => {
    it('correctly identifies function body with multi-line object return type', async () => {
      const dir = tmp()
      // The ): { ... } { pattern was causing false positives before the fix
      const src = [
        'interface FileHash { path: string; hash: string }',
        'export function findChangedFiles(',
        '  _oldHashes: FileHash[],',
        '  newHashes: FileHash[],',
        '): {',
        '    added: FileHash[]',
        '    modified: FileHash[]',
        '    deleted: FileHash[]',
        '  } {',
        '  const newMap = new Map(newHashes.map(f => [f.path, f]))',
        '  const added: FileHash[] = []',
        '  for (const [_p, nf] of newMap) { added.push(nf) }',
        '  return { added, modified: [], deleted: [] }',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // newHashes IS used in body
    })

    it('correctly identifies function body with single-line object return type', async () => {
      const dir = tmp()
      const src = [
        'function getResult(input: string): { value: string } {',
        '  return { value: input.toUpperCase() }',
        '}',
        'getResult("test")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // input IS used
    })

    it('correctly identifies function body after Promise<{ ... }> return type', async () => {
      const dir = tmp()
      const src = [
        'async function fetchData(url: string): Promise<{ data: string }> {',
        '  const response = await fetch(url)',
        '  return { data: await response.text() }',
        '}',
        'fetchData("http://example.com")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // url IS used
    })

    it('still flags truly unused params with multi-line return type', async () => {
      const dir = tmp()
      const src = [
        'export function process(',
        '  input: string,',
        '  unused: number,',
        '): {',
        '    result: string',
        '  } {',
        '  return { result: input }',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1) // unused param should be flagged
    })
  })

  describe('template literal handling', () => {
    it('does not match function keyword inside template literals', async () => {
      const dir = tmp()
      // Template string contains 'function' but it's not a real function declaration
      const src = [
        'const code = `export function handler() { return 1 }`',
        'console.log(code)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('function as property name', () => {
    it('does not treat function as property name in destructuring as a function declaration', async () => {
      const dir = tmp()
      // { function: outboundLambda } — 'function' is a property name, not keyword
      const src = [
        'const config = { function: "myLambda" } as any',
        'const { function: outboundLambda } = config',
        'console.log(outboundLambda)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('multi-line function parameters', () => {
    it('handles function with params spanning multiple lines', async () => {
      const dir = tmp()
      const src = [
        'function createUser(',
        '  name: string,',
        '  age: number,',
        '  email: string,',
        ') {',
        '  return { name, age, email }',
        '}',
        'createUser("test", 25, "test@test.com")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // all params used
    })

    it('flags unused params in multi-line function', async () => {
      const dir = tmp()
      const src = [
        'function createUser(',
        '  name: string,',
        '  age: number,',
        '  unused: string,',
        ') {',
        '  return { name, age }',
        '}',
        'createUser("test", 25, "x")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1) // unused should be flagged
    })
  })
})
