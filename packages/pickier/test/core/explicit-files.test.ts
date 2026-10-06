import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
writeFileSync(a, 'let x = "a"\ndebugger\n')
writeFileSync(b, 'let y = "b"\ndebugger\n')

describe('files named outright', () => {
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
