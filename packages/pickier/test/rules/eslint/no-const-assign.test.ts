import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-no-const-assign-'))
}

function cfg(dir: string, rules: Record<string, any> = {}) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'eslint/no-const-assign': 'error', 'pickier/no-unused-vars': 'off', ...rules },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('eslint/no-const-assign', () => {
  it('flags reassignment of const variable', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'const x = 1',
      'x = 2',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when only reading const variable', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'const x = 1',
      'console.log(x)',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes for let reassignment', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'c.ts'), [
      'let x = 1',
      'x = 2',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
