import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-max-depth-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'eslint/max-depth': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('eslint/max-depth', () => {
  it('flags deeply nested blocks exceeding max depth', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'function foo(a: boolean, b: boolean, c: boolean, d: boolean, e: boolean) {',
      '  if (a) {',
      '    if (b) {',
      '      if (c) {',
      '        if (d) {',
      '          if (e) {',
      '            console.log(1)',
      '          }',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes for shallow nesting', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'function foo(a: boolean) {',
      '  if (a) {',
      '    console.log(1)',
      '  }',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
