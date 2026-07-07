import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../../src/config'
import { runLint, scanContent } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-rule-cond-assign-'))
}

describe('no-cond-assign', () => {
  it('flags assignment inside while condition', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = [
      'let m: RegExpExecArray | null',
      'while (m = /a/.exec("a")) { break }',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noCondAssign: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('does not flag equality checks or assignments outside conditions', async () => {
    const dir = tmp()
    const file = 'b.ts'
    const src = [
      'let x = 1',
      'if (x === 1 && x !== 2) { x = 3 }',
      'for (let i = 0; i < 3; i++) {}',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noCondAssign: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('reports the column of the condition paren, not an earlier paren', () => {
    const src = 'foo(); if (x = 1) { }\n'
    const cfg = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noDebugger: 'off' as const, noConsole: 'off' as const, noCondAssign: 'error' as const },
    }
    const issues = scanContent('a.ts', src, cfg).filter(i => i.ruleId === 'no-cond-assign')
    expect(issues).toHaveLength(1)
    // The `if` paren is at 1-indexed column 11; the first ( on the line is foo's at 4
    expect(issues[0].column).toBe(11)
  })
})
