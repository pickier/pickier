import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-no-useless-catch-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'eslint/no-useless-catch': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('eslint/no-useless-catch', () => {
  it('flags catch that only rethrows', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'try {',
      '  doSomething()',
      '} catch (e) {',
      '  throw e',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when catch has additional logic', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'try {',
      '  doSomething()',
      '} catch (e) {',
      '  console.error(e)',
      '  throw e',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes when catch handles the error', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'c.ts'), [
      'try {',
      '  doSomething()',
      '} catch (e) {',
      '  handleError(e)',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
