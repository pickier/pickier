import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { version } from '../../package.json'

/**
 * The CLI's command lines, run as the CLI runs them.
 *
 * bin/cli.ts parses argv itself before the framework sees it, for the cold
 * start, and a sub-command it did not know was collected as a path instead:
 * `pickier format src --write` linted the files rather than formatting them
 * and wrote nothing, and `pickier version` was read as a path to lint, so it
 * printed nothing. Only running the CLI shows what a command line does, so
 * these run it.
 */
const CLI = resolve(__dirname, '../../bin/cli.ts')
const root = mkdtempSync(join(tmpdir(), 'pickier-cli-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const UNFORMATTED = 'export const x = "hello"  \n\n\n'

/** A project with one unformatted file, and the CLI run inside it. */
function project(name: string): { dir: string, file: string } {
  const dir = join(root, name)
  mkdirSync(join(dir, 'src'), { recursive: true })
  const file = join(dir, 'src', 'a.ts')
  writeFileSync(file, UNFORMATTED, 'utf8')
  return { dir, file }
}

function pickier(dir: string, ...args: string[]): { code: number | null, out: string } {
  const r = Bun.spawnSync(['bun', CLI, ...args], {
    cwd: dir,
    env: { ...process.env, PICKIER_NO_AUTO_CONFIG: '1' },
  })
  return { code: r.exitCode, out: `${r.stdout.toString()}${r.stderr.toString()}` }
}

describe('CLI sub-commands', () => {
  it('`version` prints the version', () => {
    const { dir } = project('version')
    const { code, out } = pickier(dir, 'version')
    expect(out.trim()).toBe(version)
    expect(code).toBe(0)
  })

  it('`lint <dir>` reports exactly what the bare form reports', () => {
    const { dir, file } = project('lint')
    const sub = pickier(dir, 'lint', 'src')
    const bare = pickier(dir, 'src')
    expect(sub.out).toContain('problem')
    expect(sub.out).toBe(bare.out)
    expect(sub.code).toBe(bare.code)
    expect(readFileSync(file, 'utf8')).toBe(UNFORMATTED)
  })

  it('`format <dir> --write` formats the files', () => {
    const { dir, file } = project('format-write')
    const { code } = pickier(dir, 'format', 'src', '--write')
    expect(code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe("export const x = 'hello'\n")
  })

  it('`format <dir>` reports what it would format, and writes nothing', () => {
    const { dir, file } = project('format-report')
    const { code, out } = pickier(dir, 'format', 'src')
    expect(code).toBe(1)
    expect(out).toContain('File is not formatted')
    expect(readFileSync(file, 'utf8')).toBe(UNFORMATTED)
  })

  it('`<dir> --format` formats the files', () => {
    const { dir, file } = project('flag-format')
    const { code } = pickier(dir, 'src', '--format')
    expect(code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe("export const x = 'hello'\n")
  })

  it('`<dir> --format --check` reports, and writes nothing', () => {
    const { dir, file } = project('flag-check')
    const { code, out } = pickier(dir, 'src', '--format', '--check')
    expect(code).toBe(1)
    expect(out).toContain('File is not formatted')
    expect(readFileSync(file, 'utf8')).toBe(UNFORMATTED)
  })

  it('`run <dir> --mode format` writes only with --write', () => {
    const { dir, file } = project('run-format')
    const report = pickier(dir, 'run', 'src', '--mode', 'format')
    expect(report.code).toBe(1)
    expect(readFileSync(file, 'utf8')).toBe(UNFORMATTED)

    const write = pickier(dir, 'run', 'src', '--mode', 'format', '--write')
    expect(write.code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe("export const x = 'hello'\n")
  })
})
