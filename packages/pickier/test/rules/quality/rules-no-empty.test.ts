import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-no-empty-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'eslint/no-empty': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('eslint/no-empty', () => {
  it('flags empty else block', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'const x = 1',
      'if (x > 0) {',
      '  console.log(x)',
      '} else {}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('flags empty try block', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'try {} catch (e) {',
      '  console.error(e)',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes for non-empty blocks', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'c.ts'), [
      'const x = 1',
      'if (x > 0) {',
      '  console.log(x)',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes for empty object literals', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'd.ts'), [
      'const obj = {}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
