import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-no-unresolved-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/import-no-unresolved': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('import/no-unresolved', () => {
  it('flags import of non-existent relative module', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'a.ts'), [
        "import { foo } from './nonexistent'",
        '',
      ].join('\n'), 'utf8')
      const code = await runLint([join(dir, 'a.ts')], { config: cfg(dir), reporter: 'json' })
      expect(code).toBe(1)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when relative import resolves', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'module.ts'), 'export const foo = 1\n')
      writeFileSync(join(dir, 'a.ts'), [
        "import { foo } from './module'",
        'export const x = foo',
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
