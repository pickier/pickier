import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'
import { noUnusedCapturingGroupRule } from '../../../src/rules/regexp/no-unused-capturing-group'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-rule-regexp-'))
}

describe('regexp/no-unused-capturing-group v flag', () => {
  const ctx = { filePath: 'a.ts', config: {} as any }
  it('still flags an unused group on a regex with the ES2024 v flag', () => {
    const noFlag = noUnusedCapturingGroupRule.check('if (/(x)/.test(s)) {}\n', ctx)
    const vFlag = noUnusedCapturingGroupRule.check('if (/(x)/v.test(s)) {}\n', ctx)
    expect(noFlag).toHaveLength(1)
    // The v flag must not blind the scanner to the unused group
    expect(vFlag).toHaveLength(1)
    expect(vFlag[0].column).toBe(noFlag[0].column)
  })
})

describe('regexp/no-unused-capturing-group', () => {
  it('flags unused capturing group in regex literal', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = [
      'const re = /(foo)-(bar)/',
      're.test("foo-bar")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('does not flag when backreference is used', async () => {
    const dir = tmp()
    const file = 'b.ts'
    const src = [
      'const re = /(foo)-\\1/',
      're.test("foo-foo")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not flag when any backreference exists (current limitation)', async () => {
    const dir = tmp()
    const file = 'c.ts'
    const src = [
      'const re = /(a)(b)(c)-\\1/', // Groups 2 and 3 unused, but rule skips due to \\1 presence
      're.test("abc-a")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0) // Current implementation skips regex with any backreferences
  })

  it('flags multiple unused capturing groups when no backreferences', async () => {
    const dir = tmp()
    const file = 'c2.ts'
    const src = [
      'const re = /(first)(second)(third)/', // All groups unused
      're.test("firstsecondthird")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('does not flag non-capturing groups', async () => {
    const dir = tmp()
    const file = 'd.ts'
    const src = [
      'const re = /(?:foo)-bar/', // Non-capturing group
      're.test("foo-bar")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not flag regex patterns without capturing groups', async () => {
    const dir = tmp()
    const file = 'e.ts'
    const src = [
      'const re = /foo-bar/', // No capturing groups
      're.test("foo-bar")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('respects rule severity levels', async () => {
    const dir = tmp()
    const file = 'f.ts'
    const src = [
      'const re = /(unused)-(group)/',
      're.test("unused-group")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'warn' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0) // Warnings don't cause failure by default
  })

  it('can be disabled', async () => {
    const dir = tmp()
    const file = 'g.ts'
    const src = [
      'const re = /(unused)-(group)/',
      're.test("unused-group")',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off', noUnusedCapturingGroup: 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})
