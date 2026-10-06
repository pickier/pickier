import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'
import { namedRule } from '../../../src/rules/imports/named'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-import-named-'))
}

function cfg(dir: string) {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/no-unused-imports': 'off', 'pickier/import-named': 'error', 'pickier/no-unused-vars': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('import/named', () => {
  it('flags import of non-existent named export', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'module.ts'), 'export const bar = 1\n')
      writeFileSync(join(dir, 'a.ts'), [
        "import { foo } from './module'",
        'export const x = foo',
        '',
      ].join('\n'), 'utf8')
      const code = await runLint([join(dir, 'a.ts')], { config: cfg(dir), reporter: 'json' })
      expect(code).toBe(1)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when named export exists', async () => {
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

  // A directory import resolves to its index file, as in Bun and Node; it
  // used to be read as a file, which threw EISDIR and lost the whole check.
  describe('directory imports', () => {
    const check = (dir: string, source: string) =>
      namedRule.check(source, { filePath: join(dir, 'a.ts'), config: {} as any })

    it('checks against the directory\'s index file', () => {
      const dir = tmp()
      try {
        mkdirSync(join(dir, 'lib'))
        writeFileSync(join(dir, 'lib', 'index.ts'), 'export const foo = 1\n')
        expect(check(dir, "import { foo } from './lib'\n")).toEqual([])
        expect(check(dir, "import { bar } from './lib'\n").map(i => i.message)).toEqual(['\'bar\' not found in \'./lib\''])
      }
      finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('prefers a file over a directory of the same name', () => {
      const dir = tmp()
      try {
        mkdirSync(join(dir, 'lib'))
        writeFileSync(join(dir, 'lib', 'index.ts'), 'export const foo = 1\n')
        writeFileSync(join(dir, 'lib.ts'), 'export const bar = 1\n')
        expect(check(dir, "import { bar } from './lib'\n")).toEqual([])
      }
      finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('reports nothing for a directory without an index file', () => {
      const dir = tmp()
      try {
        mkdirSync(join(dir, 'lib'))
        expect(check(dir, "import { foo } from './lib'\n")).toEqual([])
      }
      finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
