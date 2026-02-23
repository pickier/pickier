import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-no-return-assign-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'eslint/no-return-assign': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('eslint/no-return-assign', () => {
  it('flags assignment in return statement', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'let x = 0',
      'function foo() {',
      '  return x = 1',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes for return with comparison', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'function foo(x: number) {',
      '  return x === 1',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes for return with value', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'c.ts'), [
      'function foo(x: number) {',
      '  return x + 1',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
