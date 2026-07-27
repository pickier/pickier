import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'
import { preferConstRule } from '../../../src/rules/general/prefer-const'

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

  it('reports the column of the declared name, not a substring of a longer identifier', () => {
    const ctx = { filePath: 'a.ts', config: {} as any }
    // `tot` appears first inside `total` — the column must point at the real `tot`
    const issues = preferConstRule.check('let total = 1, tot = 2\ntotal = 3\n', ctx)
    const totIssue = issues.find(i => i.message.includes('\'tot\''))
    expect(totIssue).toBeDefined()
    expect(totIssue!.column).toBe(16)
  })
})

describe('prefer-const does not touch embedded code', () => {
  it('leaves a let inside a template literal alone', () => {
    // A template literal carrying a program for another runtime: shell,
    // an injected <script>, a snippet piped to `bun -e`. Rewriting the
    // keyword changes what that program does, and in the case this test
    // came from, produced code Bun refuses to parse.
    const text = [
      'const script = `',
      '  bun -e \'',
      '    let cur = {}; try { cur = JSON.parse(read(f)) } catch {}',
      '    console.log(cur)',
      '  \'',
      '`',
      '',
    ].join('\n')

    expect(preferConstRule.fix?.(text)).toBe(text)
  })

  it('counts a reassignment later on the same line', () => {
    // One line, two statements. The reassignment is real, so the
    // declaration cannot become const.
    const text = 'let cur = {}\nlet other = 1; other = 2\n'
    const fixed = preferConstRule.fix?.(text) ?? text

    expect(fixed).toContain('const cur = {}')
    expect(fixed).toContain('let other = 1; other = 2')
  })
})
