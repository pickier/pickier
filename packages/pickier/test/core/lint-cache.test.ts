import { afterAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * `--cache`: a run with the cache reports exactly what a run without it does,
 * re-lints what changed, and starts over when the config changes.
 */
const CLI = resolve(__dirname, '../../bin/cli.ts')
const dir = mkdtempSync(join(tmpdir(), 'pickier-cache-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

mkdirSync(join(dir, 'src'))
for (let i = 0; i < 6; i++)
  writeFileSync(join(dir, 'src', `f${i}.ts`), `let n${i} = ${i}\nexport const s${i} = "q"\nexport const u${i} = n${i}\n`)

function lint(...args: string[]): { report: string, code: number } {
  const out = join(dir, 'report.json')
  const r = Bun.spawnSync(['sh', '-c', `bun ${CLI} run src --mode lint --reporter json ${args.join(' ')} > ${out}`], { cwd: dir })
  return { report: readFileSync(out, 'utf8'), code: r.exitCode }
}

describe('lint cache', () => {
  it('reports the same with and without the cache, cold and warm', () => {
    const plain = lint()
    rmSync(join(dir, '.pickiercache'), { force: true })
    const cold = lint('--cache')
    expect(existsSync(join(dir, '.pickiercache'))).toBe(true)
    const warm = lint('--cache')
    expect(JSON.parse(plain.report).issues.length).toBeGreaterThan(0)
    expect(cold.report).toBe(plain.report)
    expect(warm.report).toBe(plain.report)
    expect(warm.code).toBe(plain.code)
  })

  it('lints a changed file again', () => {
    lint('--cache')
    writeFileSync(join(dir, 'src', 'f0.ts'), 'export const fixed = \'single\'\n')
    const warm = lint('--cache')
    expect(warm.report).toBe(lint().report)
    expect(warm.report).not.toContain('f0.ts')
  })

  it('is reused by the same project checked out somewhere else, from --cache-location', () => {
    // Every CI job gets a fresh directory; the cache lives outside it.
    const shared = join(dir, '..', `${dir.split('/').pop()}-shared.json`)
    const other = mkdtempSync(join(tmpdir(), 'pickier-cache-other-'))
    try {
      mkdirSync(join(other, 'src'))
      for (let i = 0; i < 6; i++)
        writeFileSync(join(other, 'src', `f${i}.ts`), readFileSync(join(dir, 'src', `f${i}.ts`), 'utf8'))

      rmSync(shared, { force: true })
      lint('--cache', '--cache-location', shared)
      const stored = JSON.parse(readFileSync(shared, 'utf8'))
      expect(Object.keys(stored.files)).toContain(join('src', 'f1.ts'))

      // A marker only the cache could supply proves the other checkout read it.
      stored.files[join('src', 'f1.ts')].issues.push({ filePath: '', line: 1, column: 1, ruleId: 'cache/marker', message: 'from the cache', severity: 'warning' })
      writeFileSync(shared, JSON.stringify(stored))

      const out = join(other, 'report.json')
      Bun.spawnSync(['sh', '-c', `bun ${CLI} run src --mode lint --reporter json --cache --cache-location ${shared} > ${out}`], { cwd: other })
      const report = JSON.parse(readFileSync(out, 'utf8'))
      const marker = report.issues.find((issue: { ruleId: string }) => issue.ruleId === 'cache/marker')
      expect(marker).toBeDefined()
      // Reported against this checkout's file, not the one that filled the cache.
      expect(String(marker.filePath)).toContain(join('src', 'f1.ts'))
      expect(String(marker.filePath)).not.toContain(dir)
    }
    finally {
      rmSync(other, { recursive: true, force: true })
      rmSync(shared, { force: true })
    }
  })

  it('starts over when the config changes', () => {
    lint('--cache')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify({ format: { quotes: 'double' } }))
    const withConfig = lint('--cache', '--config', 'pickier.config.json')
    expect(withConfig.report).toBe(lint('--config', 'pickier.config.json').report)
    rmSync(join(dir, 'pickier.config.json'))
  })
})
