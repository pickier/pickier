import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-lint-'))
}

describe('runLint', () => {
  it('returns 0 when no issues', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), 'const _a = 1\n', 'utf8')
    const code = await runLint([dir], { reporter: 'json' })
    expect(code).toBe(0)
  })

  it('detects debugger as error and console as warning', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), 'console.log(1)\ndebugger\n', 'utf8')
    const code = await runLint([dir], { reporter: 'compact', maxWarnings: 99 })
    expect(code).toBe(1)
  })

  it('fix removes debugger when --fix', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'debugger\nlet x=1\n', 'utf8')
    const code = await runLint([dir], { fix: true })
    expect(code).toBe(0)
    const out = readFileSync(file, 'utf8')
    expect(out.includes('debugger')).toBe(false)
  })

  it('fix normalizes indent on flagged lines (3 spaces → 2 spaces)', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'function f() {\n   const x = 1\n  return x\n}\n', 'utf8')
    await runLint([dir], { fix: true })
    const out = readFileSync(file, 'utf8')
    expect(out).toBe('function f() {\n  const x = 1\n  return x\n}\n')
  })

  it('fix converts tabs to spaces in a spaces-configured project', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'function f() {\n\tconst x = 1\n}\n', 'utf8')
    await runLint([dir], { fix: true })
    const out = readFileSync(file, 'utf8')
    expect(out).toBe('function f() {\n  const x = 1\n}\n')
  })

  it('fix preserves JSDoc * continuation indent (1 space past base)', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = '/**\n * Doc\n */\nfunction f() {\n  return 1\n}\n'
    writeFileSync(file, src, 'utf8')
    await runLint([dir], { fix: true })
    const out = readFileSync(file, 'utf8')
    expect(out).toBe(src)
  })

  it('fix preserves multi-line function signatures', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = 'export async function generate(\n  outputDir: string,\n  config: Config,\n): Promise<void> {\n  return\n}\n'
    writeFileSync(file, src, 'utf8')
    await runLint([dir], { fix: true })
    const out = readFileSync(file, 'utf8')
    expect(out).toBe(src)
  })

  it('fix does not touch markdown indentation (3-space continuation preserved)', async () => {
    const dir = tmp()
    const file = join(dir, 'a.md')
    // Lists, blockquotes etc. legitimately use 3-space (ordered-list
    // continuation) and other non-multiple widths per CommonMark — the
    // indent fixer must not touch these.
    const src = '# Title\n\n   indented quote-like continuation line\n'
    writeFileSync(file, src, 'utf8')
    await runLint([dir], { fix: true })
    const out = readFileSync(file, 'utf8')
    expect(out).toBe(src)
  })

  it('dry-run simulates fix without writing', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = 'debugger\nlet x=1\n'
    writeFileSync(file, src, 'utf8')
    const code = await runLint([dir], { fix: true, dryRun: true })
    expect(code).toBe(0)
    const out = readFileSync(file, 'utf8')
    expect(out).toBe(src)
  })

  it('does not remove "debugger" inside strings (lint --fix does not format/quote-convert)', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = 'const _s = "debugger"\n'
    writeFileSync(file, src, 'utf8')
    const code = await runLint([dir], { fix: true })
    expect(code).toBe(0)
    const out = readFileSync(file, 'utf8')
    expect(out).toBe(src)
  })

  it('does not remove "debugger" in comments', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = '// debugger\n/* debugger */\nconst _x = 1\n'
    writeFileSync(file, src, 'utf8')
    const code = await runLint([dir], { fix: true })
    expect(code).toBe(0)
    const out = readFileSync(file, 'utf8')
    expect(out).toBe(src)
  })

  it('fails when warnings exceed max-warnings', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), 'console.log(1)\n', 'utf8')
    const code = await runLint([dir], { reporter: 'json', maxWarnings: 0 })
    expect(code).toBe(1)
  })

  it('supports stylish reporter and verbose output', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), 'console.log(1)\n', 'utf8')
    const code = await runLint([dir], { reporter: 'stylish', verbose: true })
    expect(code).toBe(0)
  })
})
