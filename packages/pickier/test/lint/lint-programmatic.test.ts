import type { LintOptions } from '../../src/types'
import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/config'
import { lintText, runLintProgrammatic } from '../../src/index'

function makeAbortSignal(abortImmediately = false): AbortSignal {
  const controller = new AbortController()
  if (abortImmediately)
    controller.abort()
  return controller.signal
}

describe('programmatic lintText', () => {
  it('returns issues for in-memory text without touching filesystem', async () => {
    const text = 'console.log(\'hi\')\n'

    const issues = await lintText(text, { ...defaultConfig }, 'file.ts')

    expect(Array.isArray(issues)).toBe(true)
    // default config warns on console
    expect(issues.some(i => i.ruleId === 'no-console')).toBe(true)
  })

  it('reports console after a string ending in an escaped backslash', async () => {
    // "test\\" ends the string — the closing quote is not escaped
    const text = 'const s = "test\\\\"; console.log(s)\n'

    const issues = await lintText(text, { ...defaultConfig }, 'file.ts')

    expect(issues.some(i => i.ruleId === 'no-console')).toBe(true)
  })

  it('supports cancellation via AbortSignal', async () => {
    const signal = makeAbortSignal(true)
    await expect(lintText('debugger\n', { ...defaultConfig }, 'a.ts', signal)).rejects.toThrow('AbortError')
  })
})

describe('programmatic runLintProgrammatic', () => {
  it('lints a concrete file path and returns structured result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pickier-prog-'))
    try {
      const fp = join(dir, 'x.ts')
      writeFileSync(fp, 'console.log(1)\n')

      const opts: LintOptions = { reporter: 'json', maxWarnings: -1 }
      const res = await runLintProgrammatic([fp], opts)

      expect(res.errors).toBeGreaterThanOrEqual(0)
      expect(res.warnings).toBeGreaterThanOrEqual(0)
      expect(res.issues.some(i => i.filePath === fp)).toBe(true)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('honors --fix for simple built-in fixes and recomputes issues', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pickier-prog-fix-'))
    try {
      const fp = join(dir, 'y.ts')
      writeFileSync(fp, 'debugger\n')

      const opts: LintOptions = { reporter: 'json', maxWarnings: -1, fix: true }
      const res = await runLintProgrammatic([fp], opts)

      // After fix, no-debugger should not appear
      expect(res.issues.some(i => i.ruleId === 'no-debugger')).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('supports cancellation before work starts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pickier-prog-abort-'))
    try {
      const fp = join(dir, 'z.ts')
      writeFileSync(fp, 'console.log(1)\n')
      const opts: LintOptions = { reporter: 'json', maxWarnings: -1 }

      await expect(runLintProgrammatic([fp], opts, makeAbortSignal(true))).rejects.toThrow('AbortError')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
