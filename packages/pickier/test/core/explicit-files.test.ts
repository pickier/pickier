import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runLintProgrammatic } from '../../src/linter'
import { glob } from '../../src/utils'

/**
 * Several files named outright - as lint-staged and editors pass them, often
 * as absolute paths outside the working directory - are each linted. They
 * used to go to Bun.Glob, which matches from the working directory, so every
 * file was skipped and the run reported a clean result.
 */
const CLI = resolve(__dirname, '../../bin/cli.ts')
const dir = mkdtempSync(join(tmpdir(), 'pickier-explicit-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const a = join(dir, 'a.ts')
const b = join(dir, 'b.ts')
const routes = join(dir, '[group]')
mkdirSync(routes)
const dynamic = join(routes, '[slug].ts')
writeFileSync(dynamic, 'debugger\n')
writeFileSync(join(routes, 's.ts'), 'const decoy = true\n')
writeFileSync(a, 'let x = "a"\ndebugger\n')
writeFileSync(b, 'let y = "b"\ndebugger\n')

describe('files named outright', () => {
  it('lints a dynamic route filename through the SDK', async () => {
    const result = await runLintProgrammatic([dynamic], { reporter: 'json' })
    expect(result.issues.some(issue => issue.ruleId === 'no-debugger')).toBe(true)
    expect(new Set(result.issues.map(issue => issue.filePath))).toEqual(new Set([dynamic]))
  })

  it.each([false, true])('keeps literal bracket paths, ignores and real globs (Node fallback: %s)', async (fallback) => {
    const nativeGlob = Bun.Glob
    if (fallback)
      (Bun as any).Glob = undefined
    try {
      expect(await glob(['[group]/[slug].ts'], { cwd: dir })).toEqual([dynamic])
      expect(await glob([dynamic], { cwd: dir, absolute: false })).toEqual(['[group]/[slug].ts'])
      expect(await glob([dynamic], { cwd: dir, ignore: ['**/*.ts'] })).toEqual([])
      expect(new Set(await glob(['[group]'], { cwd: dir }))).toEqual(new Set([dynamic, join(routes, 's.ts')]))
      expect(new Set(await glob(['[ab].ts'], { cwd: dir }))).toEqual(new Set([a, b]))
    }
    finally {
      (Bun as any).Glob = nativeGlob
    }
  })

  it('globs to themselves', async () => {
    expect(await glob([a, b])).toEqual([a, b])
    expect(await glob([join(dir, 'missing.ts')])).toEqual([])
  })

  it('are each linted through the API', async () => {
    const one = await runLintProgrammatic([a], { reporter: 'json' })
    const both = await runLintProgrammatic([a, b], { reporter: 'json' })
    expect(one.issues.length).toBeGreaterThan(0)
    expect(both.issues.length).toBe(one.issues.length * 2)
    expect(new Set(both.issues.map(i => i.filePath))).toEqual(new Set([a, b]))
  })

  it('are each linted by the CLI', () => {
    const out = join(dir, 'out.json')
    Bun.spawnSync(['sh', '-c', `bun ${CLI} run ${a} ${b} --mode lint --reporter json > ${out}`])
    const report = JSON.parse(readFileSync(out, 'utf8'))
    expect(new Set(report.issues.map((i: { filePath: string }) => i.filePath))).toEqual(new Set([a, b]))
  })
})
