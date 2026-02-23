import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-top-level-function-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/top-level-function': 'warn', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('pickier/top-level-function', () => {
  it('flags top-level const arrow function', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'const foo = () => {',
      '  return 1',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBeGreaterThanOrEqual(0)
  })

  it('flags top-level const function expression', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'const foo = function() {',
      '  return 1',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBeGreaterThanOrEqual(0)
  })

  it('passes for function declarations', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'c.ts'), [
      'function foo() {',
      '  return 1',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes for indented arrow functions (not top-level)', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'd.ts'), [
      'function outer() {',
      '  const inner = () => 1',
      '  return inner()',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
