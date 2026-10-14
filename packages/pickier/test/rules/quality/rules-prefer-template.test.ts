import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-rule-prefer-template-'))
}

describe('pickier/prefer-template', () => {
  it('flags string concatenation with +', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = [
      'const greeting = \'Hello \' + name',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'general/prefer-template': 'error', 'pickier/no-unused-vars': 'off', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('flags string concatenation with variable + string', async () => {
    const dir = tmp()
    const file = 'b.ts'
    const src = [
      'const message = prefix + \' world\'',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'general/prefer-template': 'error', 'pickier/no-unused-vars': 'off', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('accepts template literals', async () => {
    const dir = tmp()
    const file = 'c.ts'
    const src = [
      'const greeting = `Hello ${name}`',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'general/prefer-template': 'error', 'pickier/no-unused-vars': 'off', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('accepts number addition', async () => {
    const dir = tmp()
    const file = 'd.ts'
    const src = [
      'const sum = a + b',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'general/prefer-template': 'error', 'pickier/no-unused-vars': 'off', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('respects rule severity levels', async () => {
    const dir = tmp()
    const file = 'e.ts'
    const src = [
      'const greeting = "Hello " + name',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'pickier/prefer-template': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0) // Warnings don't cause failure by default
  })

  it('can be disabled', async () => {
    const dir = tmp()
    const file = 'f.ts'
    const src = [
      'const greeting = "Hello " + name',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'pickier/prefer-template': 'off', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  // A `+` that is string, template or comment content is text, not an
  // operator, and there is no concatenation there to replace (#1380)
  it('ignores a + inside a string literal', async () => {
    const dir = tmp()
    const src = [
      'export const generated: string[] = [',
      '  \'server.on("connection", (info) => {\',',
      '  \'  console.log(`+ Client connected: ${info.subdomain}`)\',',
      '  \'})\',',
      ']',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'g.ts'), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'general/prefer-template': 'error', 'pickier/no-unused-vars': 'off', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('ignores a + inside a template literal spanning lines', async () => {
    const dir = tmp()
    const src = [
      'export const script = `',
      '  echo "total: " + count',
      '`',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'h.ts'), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'general/prefer-template': 'error', 'pickier/no-unused-vars': 'off', 'style/max-statements-per-line': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})
