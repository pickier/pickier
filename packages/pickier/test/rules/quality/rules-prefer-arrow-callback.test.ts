import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-prefer-arrow-callback-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'eslint/prefer-arrow-callback': 'warn', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('eslint/prefer-arrow-callback', () => {
  it('flags function() in map callback', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'const arr = [1, 2, 3]',
      'const result = arr.map(function(x) { return x * 2 })',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBeGreaterThanOrEqual(0)
  })

  it('flags function() in forEach callback', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'const arr = [1, 2, 3]',
      'arr.forEach(function(x) { console.log(x) })',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBeGreaterThanOrEqual(0)
  })

  it('passes for arrow function callbacks', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'c.ts'), [
      'const arr = [1, 2, 3]',
      'const result = arr.map(x => x * 2)',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
