import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-parity-'))
}

function makeUnusedVarsConfig(dir: string): string {
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

function makePreferConstConfig(dir: string): string {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/prefer-const': 'error', 'pickier/no-unused-vars': 'off', 'style/max-statements-per-line': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('no-unused-vars edge cases', () => {
  describe('destructuring alias handling', () => {
    it('does not flag property keys in destructuring aliases', async () => {
      const dir = tmp()
      const src = [
        'const obj = { logicalId: "test", value: 42 }',
        'const { logicalId: eipLogicalId } = obj',
        'console.log(eipLogicalId)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('flags unused alias values', async () => {
      const dir = tmp()
      const src = [
        'const obj = { logicalId: "test" }',
        'const { logicalId: eipLogicalId } = obj',
        'console.log("done")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(1)
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
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
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
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('multi-line return type annotations', () => {
    it('correctly identifies function body with multi-line object return type', async () => {
      const dir = tmp()
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
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
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
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
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
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  describe('template literal handling', () => {
    it('does not match function keyword inside template literals', async () => {
      const dir = tmp()
      const src = [
        'const code = `export function handler() { return 1 }`',
        'console.log(code)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
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
      const code = await runLint([dir], { config: makeUnusedVarsConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })
})

describe('prefer-const edge cases', () => {
  it('does not false-positive on commas inside string literals', async () => {
    const dir = tmp()
    const src = [
      'let cc = \'public, max-age=3600\'',
      'cc = \'private\'',
      'console.log(cc)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makePreferConstConfig(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('correctly flags let that is never reassigned', async () => {
    const dir = tmp()
    const src = [
      'let cc = \'public, max-age=3600\'',
      'console.log(cc)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makePreferConstConfig(dir), reporter: 'json' })
    expect(code).toBe(1)
  })
})
