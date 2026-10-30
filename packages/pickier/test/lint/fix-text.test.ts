import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/config'
import { fixText, lintText, runLint, runLintProgrammatic } from '../../src/index'

// fixText is `--fix` for a buffer: what an editor's fix-all applies to unsaved
// text. It must produce exactly what runLint --fix writes to disk.

const samples: Record<string, string> = {
  'debugger.ts': 'function f() {\n  debugger\n  return 1\n}\n',
  'indent.ts': 'function f() {\n   return 1\n}\n',
  'clean.ts': 'export const a = 1\n',
  // Both halves of fixText at once: a line only the plugin fixers touch and a
  // line only the indent fixer touches. An entry point that skips either one
  // produces different bytes for this file.
  'both.ts': 'function f() {\n   const x = 1\n  debugger\n   return x\n}\n',
}

describe('fixText', () => {
  it('applies the fixes and leaves clean text alone', async () => {
    const cfg = { ...defaultConfig }
    const fixed = fixText(samples['debugger.ts']!, cfg, 'debugger.ts')

    expect(fixed).not.toContain('debugger')
    expect((await lintText(fixed, cfg, 'debugger.ts')).some(issue => issue.ruleId.includes('debugger'))).toBe(false)
    expect(fixText(samples['clean.ts']!, cfg, 'clean.ts')).toBe(samples['clean.ts']!)
  })

  it('matches what runLint --fix writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pickier-fixtext-'))
    try {
      for (const [name, text] of Object.entries(samples)) {
        const file = join(dir, name)
        writeFileSync(file, text)
        await runLint([file], { fix: true, reporter: 'json', maxWarnings: -1 })
        expect(readFileSync(file, 'utf8')).toBe(fixText(text, { ...defaultConfig }, file))
      }
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // runLintProgrammatic used to inline the first two steps of fixText and stop
  // there, so `{ fix: true }` through the API applied every plugin fixer but
  // never the indent one: the CLI reindented `both.ts` and the API left it.
  it('matches what runLintProgrammatic --fix writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pickier-fixtext-prog-'))
    try {
      for (const [name, text] of Object.entries(samples)) {
        const file = join(dir, name)
        writeFileSync(file, text)
        await runLintProgrammatic([file], { fix: true, reporter: 'json', maxWarnings: -1 })
        expect(readFileSync(file, 'utf8')).toBe(fixText(text, { ...defaultConfig }, file))
      }
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes the same bytes through the CLI and the API', async () => {
    const viaCli = mkdtempSync(join(tmpdir(), 'pickier-fixtext-cli-'))
    const viaApi = mkdtempSync(join(tmpdir(), 'pickier-fixtext-api-'))
    try {
      for (const [name, text] of Object.entries(samples)) {
        writeFileSync(join(viaCli, name), text)
        writeFileSync(join(viaApi, name), text)
      }
      await runLint([viaCli], { fix: true, reporter: 'json', maxWarnings: -1 })
      await runLintProgrammatic([viaApi], { fix: true, reporter: 'json', maxWarnings: -1 })

      for (const name of Object.keys(samples)) {
        expect(readFileSync(join(viaApi, name), 'utf8')).toBe(readFileSync(join(viaCli, name), 'utf8'))
      }
      // and the indent fixer really did run on the file that needs it
      expect(readFileSync(join(viaApi, 'both.ts'), 'utf8')).toBe('function f() {\n  const x = 1\n  return x\n}\n')
    }
    finally {
      rmSync(viaCli, { recursive: true, force: true })
      rmSync(viaApi, { recursive: true, force: true })
    }
  })
})
