import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const ZIG_BIN = join(__dirname, '..', '..', '..', '..', 'zig', 'zig-out', 'bin', 'pickier-zig')

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-zig-parity-'))
}

function runZig(dir: string, file: string): { exitCode: number, output: string } {
  try {
    const output = execSync(`${ZIG_BIN} lint ${file}`, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { exitCode: 0, output }
  } catch (e: any) {
    return { exitCode: e.status ?? 1, output: (e.stdout || '') + (e.stderr || '') }
  }
}

const zigExists = existsSync(ZIG_BIN)
const describeZig = zigExists ? describe : describe.skip

describeZig('zig parity: no-unused-vars edge cases', () => {
  describe('destructuring alias handling', () => {
    it('does not flag property keys in destructuring aliases', () => {
      const dir = tmp()
      const src = [
        'const obj = { logicalId: "test", value: 42 }',
        'const { logicalId: eipLogicalId } = obj',
        'console.log(eipLogicalId)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const result = runZig(dir, 'a.ts')
      // Should not have no-unused-vars errors (may have console warning)
      expect(result.output).not.toContain('no-unused-vars')
    })

    it('flags unused alias values', () => {
      const dir = tmp()
      const src = [
        'const obj = { logicalId: "test" }',
        'const { logicalId: eipLogicalId } = obj',
        'console.log("done")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const result = runZig(dir, 'a.ts')
      expect(result.output).toContain('no-unused-vars')
    })

    it('handles rest elements in destructuring', () => {
      const dir = tmp()
      const src = [
        'const arr = [1, 2, 3, 4, 5]',
        'const [_first, ...rest] = arr',
        'console.log(rest)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const result = runZig(dir, 'a.ts')
      expect(result.output).not.toContain('no-unused-vars')
    })

    it('handles multiple aliases in destructuring', () => {
      const dir = tmp()
      const src = [
        'const config = { host: "localhost", port: 3000 }',
        'const { host: serverHost, port: serverPort } = config',
        'console.log(serverHost, serverPort)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const result = runZig(dir, 'a.ts')
      expect(result.output).not.toContain('no-unused-vars')
    })
  })

  describe('multi-line return type annotations', () => {
    it('correctly identifies function body with multi-line object return type', () => {
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
      const result = runZig(dir, 'a.ts')
      // newHashes IS used — should not flag it
      expect(result.output).not.toContain('newHashes')
      expect(result.output).not.toContain('no-unused-vars')
    })

    it('correctly identifies function body with single-line object return type', () => {
      const dir = tmp()
      const src = [
        'function getResult(input: string): { value: string } {',
        '  return { value: input.toUpperCase() }',
        '}',
        'getResult("test")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const result = runZig(dir, 'a.ts')
      expect(result.output).not.toContain('no-unused-vars')
    })

    it('correctly identifies function body after Promise<{ ... }> return type', () => {
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
      const result = runZig(dir, 'a.ts')
      expect(result.output).not.toContain('no-unused-vars')
    })
  })

  describe('template literal handling', () => {
    it('does not match function keyword inside template literals', () => {
      const dir = tmp()
      const src = [
        'const code = `export function handler() { return 1 }`',
        'console.log(code)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const result = runZig(dir, 'a.ts')
      expect(result.output).not.toContain('no-unused-vars')
    })
  })

  describe('multi-line function parameters', () => {
    it('handles function with params spanning multiple lines', () => {
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
      const result = runZig(dir, 'a.ts')
      expect(result.output).not.toContain('no-unused-vars')
    })
  })
})

describeZig('zig parity: prefer-const edge cases', () => {
  it('does not false-positive on commas inside string literals', () => {
    const dir = tmp()
    const src = [
      'let cc = \'public, max-age=3600\'',
      'cc = \'private\'',
      'console.log(cc)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const result = runZig(dir, 'a.ts')
    expect(result.output).not.toContain('prefer-const')
  })

  it('correctly flags let that is never reassigned', () => {
    const dir = tmp()
    const src = [
      'let cc = \'public, max-age=3600\'',
      'console.log(cc)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const result = runZig(dir, 'a.ts')
    expect(result.output).toContain('prefer-const')
  })
})
