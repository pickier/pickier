import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-no-cycle-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/import-no-cycle': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('import/no-cycle', () => {
  it('flags circular dependency between two files', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'a.ts'), [
        "import { b } from './b'",
        'export const a = 1',
        '',
      ].join('\n'), 'utf8')
      writeFileSync(join(dir, 'b.ts'), [
        "import { a } from './a'",
        'export const b = 2',
        '',
      ].join('\n'), 'utf8')
      const code = await runLint([join(dir, 'a.ts')], { config: cfg(dir), reporter: 'json' })
      expect(code).toBe(1)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when no circular dependency exists', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'a.ts'), [
        "import { b } from './b'",
        'export const a = b + 1',
        '',
      ].join('\n'), 'utf8')
      writeFileSync(join(dir, 'b.ts'), [
        'export const b = 2',
        '',
      ].join('\n'), 'utf8')
      const code = await runLint([join(dir, 'a.ts')], { config: cfg(dir), reporter: 'json' })
      expect(code).toBe(0)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes for npm package imports', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'a.ts'), [
        "import { something } from 'some-package'",
        'export const a = 1',
        '',
      ].join('\n'), 'utf8')
      const code = await runLint([join(dir, 'a.ts')], { config: cfg(dir), reporter: 'json' })
      expect(code).toBe(0)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
