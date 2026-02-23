import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-no-fallthrough-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'eslint/no-fallthrough': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('eslint/no-fallthrough', () => {
  it('flags fallthrough between cases', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), [
      'const x = 1',
      'switch (x) {',
      '  case 1:',
      '    console.log(1)',
      '  case 2:',
      '    console.log(2)',
      '    break',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when all cases have break', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'b.ts'), [
      'const x = 1',
      'switch (x) {',
      '  case 1:',
      '    console.log(1)',
      '    break',
      '  case 2:',
      '    console.log(2)',
      '    break',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes when cases use return', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'c.ts'), [
      'function foo(x: number) {',
      '  switch (x) {',
      '    case 1:',
      '      return 1',
      '    case 2:',
      '      return 2',
      '  }',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes with intentional fallthrough comment', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'd.ts'), [
      'const x = 1',
      'switch (x) {',
      '  case 1: // falls through',
      '  case 2:',
      '    console.log(2)',
      '    break',
      '}',
      '',
    ].join('\n'), 'utf8')
    const code = await runLint([dir], { config: cfg(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
