import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-prefer-const-edge-'))
}

function makeConfig(dir: string): string {
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

describe('prefer-const edge cases (regression tests)', () => {
  it('does not false-positive on commas inside string literals', async () => {
    const dir = tmp()
    // 'public, max-age=3600' contains a comma — splitTopLevel must not split on it
    const src = [
      'let cc = \'public, max-age=3600\'',
      'cc = \'private\'',
      'console.log(cc)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
    expect(code).toBe(0) // cc IS reassigned, should not flag
  })

  it('does not false-positive on commas inside double-quoted strings', async () => {
    const dir = tmp()
    const src = [
      'let headers = "Accept: text/html, application/json"',
      'headers = "Accept: */*"',
      'console.log(headers)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not false-positive on commas inside template literals', async () => {
    const dir = tmp()
    const src = [
      'let msg = `Hello, world`',
      'msg = `Goodbye, world`',
      'console.log(msg)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('correctly flags let that is never reassigned even with string initializer', async () => {
    const dir = tmp()
    const src = [
      'let cc = \'public, max-age=3600\'',
      'console.log(cc)',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
    expect(code).toBe(1) // cc is never reassigned, should be const
  })
})
