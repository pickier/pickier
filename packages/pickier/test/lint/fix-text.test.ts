import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/config'
import { fixText, lintText, runLint } from '../../src/index'

// fixText is `--fix` for a buffer: what an editor's fix-all applies to unsaved
// text. It must produce exactly what runLint --fix writes to disk.

const samples: Record<string, string> = {
  'debugger.ts': 'function f() {\n  debugger\n  return 1\n}\n',
  'indent.ts': 'function f() {\n   return 1\n}\n',
  'clean.ts': 'export const a = 1\n',
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
})
