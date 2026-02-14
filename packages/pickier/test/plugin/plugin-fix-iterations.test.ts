import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-plugin-fix-'))
}

describe('plugin fix iterations', () => {
  it('iteratively applies fixes until stable', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const configFile = join(dir, 'pickier.config.json')

    // Unsorted object that needs multiple passes to fully sort
    writeFileSync(file, 'const _obj = { z: 1, a: 2, m: 3 }\n', 'utf8')
    writeFileSync(configFile, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'pickier/sort-objects': 'warn' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: configFile, fix: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    // Object should be sorted: a, m, z
    expect(result.includes('a: 2')).toBe(true)
  })

  it('respects max passes limit', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const configFile = join(dir, 'pickier.config.json')

    writeFileSync(file, 'const _x = { b: 1, a: 2 }\nconst _y = { d: 3, c: 4 }\n', 'utf8')
    writeFileSync(configFile, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'pickier/sort-objects': 'warn' },
    }, null, 2), 'utf8')

    // Should complete without infinite loop (max 3 passes)
    const code = await runLint([dir], { config: configFile, fix: true })
    expect(code).toBe(0)
  })

  it('handles rules with no fix function', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const configFile = join(dir, 'pickier.config.json')

    writeFileSync(file, 'const _x = 1\n', 'utf8')
    writeFileSync(configFile, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'error', noConsole: 'warn' },
      pluginRules: {},
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: configFile, fix: true })
    expect(code).toBe(0)
  })

  it('applies multiple plugin fixes in sequence', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const configFile = join(dir, 'pickier.config.json')

    writeFileSync(file, 'const _obj = { z: 1, a: 2 }\nconst _arr = [3, 1, 2]\n', 'utf8')
    writeFileSync(configFile, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: {
        'pickier/sort-objects': 'warn',
      },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: configFile, fix: true })
    expect(code).toBe(0)
  })

  it('handles disabled plugin rules', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const configFile = join(dir, 'pickier.config.json')

    const original = 'const _obj = { z: 1, a: 2 }\n'
    writeFileSync(file, original, 'utf8')
    writeFileSync(configFile, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: {
        'pickier/sort-objects': 'off', // Disabled
      },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: configFile, fix: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    // Object should remain unsorted since rule is disabled
    expect(result.includes('z: 1, a: 2')).toBe(true)
  })

  it('handles PICKIER_TRACE environment variable', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, 'const _x = 1\n', 'utf8')

    // Set trace mode
    process.env.PICKIER_TRACE = '1'
    const code = await runLint([dir], { fix: true, reporter: 'json' })
    delete process.env.PICKIER_TRACE

    expect(code).toBe(0)
  })

  it('removes debugger statements when fix is enabled', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, 'debugger\nconst _x = 1\ndebugger\n', 'utf8')

    const code = await runLint([dir], { fix: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    expect(result.includes('debugger')).toBe(false)
  })

  it('preserves debugger when rule is disabled', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const configFile = join(dir, 'pickier.config.json')

    writeFileSync(file, 'debugger\nconst _x = 1\n', 'utf8')
    writeFileSync(configFile, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: {},
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: configFile, fix: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    expect(result.includes('debugger')).toBe(true)
  })
})
