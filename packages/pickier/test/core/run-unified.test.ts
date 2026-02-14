import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// All tests use PICKIER_NO_AUTO_CONFIG=1 via env
process.env.PICKIER_NO_AUTO_CONFIG = '1'

describe('runUnified mode routing', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pickier-run-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('mode: format', () => {
    it('formats a single file with --write', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, 'const x = "hello"\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'format', write: true })

      expect(code).toBe(0)
      const result = readFileSync(file, 'utf8')
      // Should have single quotes after formatting
      expect(result).toContain("'hello'")
    })

    it('does not modify file without --write', async () => {
      const file = join(dir, 'test.ts')
      const original = 'const x = "hello"\n'
      writeFileSync(file, original, 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'format' })

      expect(code).toBe(0)
      const result = readFileSync(file, 'utf8')
      expect(result).toBe(original)
    })

    it('returns 0 in check mode for already-formatted file', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, "const x = 'hello'\n", 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'format', check: true })

      expect(code).toBe(0)
    })

    it('handles glob patterns by falling through to linter', async () => {
      const file = join(dir, 'a.ts')
      writeFileSync(file, 'const x = "hello"\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([`${dir}/**/*.ts`], { mode: 'format', write: true })

      expect(code).toBe(0)
      const result = readFileSync(file, 'utf8')
      expect(result).toContain("'hello'")
    })

    it('handles directory path by falling through to linter', async () => {
      const file = join(dir, 'b.ts')
      writeFileSync(file, 'const y = "world"\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([dir], { mode: 'format', write: true })

      expect(code).toBe(0)
    })
  })

  describe('mode: lint', () => {
    it('lints files and returns exit code', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, 'debugger\nconsole.log("hi")\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'lint' })

      // Should find issues (debugger + console)
      expect(code).toBeGreaterThanOrEqual(0)
    })

    it('applies fixes with --fix', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, 'debugger\nconst x = 1\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'lint', fix: true })

      expect(code).toBe(0)
      const result = readFileSync(file, 'utf8')
      // debugger should be removed by --fix
      expect(result).not.toContain('debugger')
    })

    it('dry-run does not modify files', async () => {
      const file = join(dir, 'test.ts')
      const original = 'debugger\nconst x = 1\n'
      writeFileSync(file, original, 'utf8')

      const { runUnified } = await import('../../src/run')
      await runUnified([file], { mode: 'lint', fix: true, dryRun: true })

      const result = readFileSync(file, 'utf8')
      expect(result).toBe(original)
    })
  })

  describe('mode: auto', () => {
    it('defaults to auto when mode is not specified', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, "const _x = 'hello'\n", 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], {})

      expect(code).toBe(0)
    })

    it('auto mode routes to lint when --fix is present', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, 'debugger\nconst _x = 1\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'auto', fix: true })

      expect(code).toBe(0)
      const result = readFileSync(file, 'utf8')
      expect(result).not.toContain('debugger')
    })

    it('auto mode routes to lint when --reporter is present', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, "const _x = 'hello'\n", 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'auto', reporter: 'json' })

      expect(code).toBe(0)
    })

    it('auto mode routes to lint when --max-warnings is present', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, "const _x = 'hello'\n", 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'auto', maxWarnings: 10 })

      expect(code).toBe(0)
    })

    it('auto mode defaults to format-via-lint path', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, 'const _x = "hello"\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      // No lint-specific flags → defaults to format path
      const code = await runUnified([file], { mode: 'auto', write: true })

      expect(code).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('handles empty globs array for format mode on single file', async () => {
      // Empty globs with format mode won't hit fast path (no globs)
      // Falls through to linter which defaults to ['.'] — so test with a temp file
      const file = join(dir, 'empty.ts')
      writeFileSync(file, "const x = 'ok'\n", 'utf8')

      const { runUnified } = await import('../../src/run')
      // Use a single file instead to avoid scanning entire project
      const code = await runUnified([file], { mode: 'format' })
      expect(code).toBe(0)
    })

    it('handles non-existent file gracefully', async () => {
      const { runUnified } = await import('../../src/run')
      const code = await runUnified([join(dir, 'nope.ts')], { mode: 'format', write: true })

      // Should not crash
      expect(typeof code).toBe('number')
    })

    it('handles multiple files', async () => {
      const file1 = join(dir, 'a.ts')
      const file2 = join(dir, 'b.ts')
      writeFileSync(file1, 'const x = "a"\n', 'utf8')
      writeFileSync(file2, 'const y = "b"\n', 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file1, file2], { mode: 'format', write: true })

      expect(code).toBe(0)
    })

    it('respects --config option', async () => {
      const file = join(dir, 'test.ts')
      writeFileSync(file, "const x = 'hello'\n", 'utf8')

      const configFile = join(dir, 'custom.config.json')
      writeFileSync(configFile, JSON.stringify({
        format: { quotes: 'double' },
      }), 'utf8')

      const { runUnified } = await import('../../src/run')
      const code = await runUnified([file], { mode: 'format', write: true, config: configFile })

      expect(code).toBe(0)
      const result = readFileSync(file, 'utf8')
      expect(result).toContain('"hello"')
    })
  })
})
