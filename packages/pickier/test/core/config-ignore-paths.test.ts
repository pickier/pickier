import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { createIgnoreMatcher, glob, shouldIgnorePath } from '../../src/utils'

describe('configured literal ignore paths', () => {
  it('matches project-root filenames without matching nested or outside files', () => {
    const root = resolve('ignore-path-project')
    const matches = createIgnoreMatcher(['CHANGELOG.md'], root)
    expect(matches(join(root, 'CHANGELOG.md'))).toBe(true)
    expect(matches(join(root, 'docs/CHANGELOG.md'))).toBe(false)
    expect(matches(join(root, 'CHANGELOG.md.backup'))).toBe(false)
    expect(matches(`${root}-other/CHANGELOG.md`)).toBe(false)
    expect(matches('CHANGELOG.md')).toBe(true)
    expect(matches('docs/CHANGELOG.md')).toBe(false)
    expect(shouldIgnorePath(join(process.cwd(), 'CHANGELOG.md'), ['CHANGELOG.md'])).toBe(true)
  })

  it('matches literal relative files and directories with path boundaries', () => {
    const root = resolve('ignore-path-project')
    const matches = createIgnoreMatcher(['./docs/notes.md', 'generated/'], root)
    expect(matches(join(root, 'docs/notes.md'))).toBe(true)
    expect(matches(join(root, 'other/docs/notes.md'))).toBe(false)
    expect(matches(join(root, 'generated'))).toBe(true)
    expect(matches(join(root, 'generated/nested/output.ts'))).toBe(true)
    expect(matches(join(root, 'generated-other/output.ts'))).toBe(false)
    expect(matches(`${root}-other/generated/output.ts`)).toBe(false)
  })

  it('normalizes absolute paths, dot prefixes and platform separators', () => {
    const root = resolve('ignore-path-project')
    const absoluteFile = join(root, 'notes.md')
    const matches = createIgnoreMatcher([absoluteFile, '.\\docs\\draft.md'], root)
    expect(matches(absoluteFile)).toBe(true)
    expect(matches(join(root, 'docs/draft.md').replace(/\//g, '\\'))).toBe(true)
    expect(matches(join(root, 'notes.md.backup'))).toBe(false)
    expect(matches(join(root, 'other/docs/draft.md'))).toBe(false)
    expect(matches(`${root}-other/notes.md`)).toBe(false)
    expect(matches(`${root}-other/docs/draft.md`)).toBe(false)
  })

  it('treats bare parentheses and internal exclamation marks as literal filename characters', () => {
    const root = resolve('ignore-path-project')
    for (const filename of ['notes (old).md', 'notes!.md']) {
      expect(new Bun.Glob(filename).match(filename)).toBe(true)
      const matches = createIgnoreMatcher([filename], root)
      expect(matches(join(root, filename))).toBe(true)
      expect(matches(join(root, `other/${filename}`))).toBe(false)
    }
    // These have actual glob operators, so they must not become literal paths.
    for (const pattern of ['!notes.md', '@(notes|draft).md', '+(notes).md', '!(notes).md'])
      expect(createIgnoreMatcher([pattern], root)(join(root, pattern))).toBe(false)
  })

  it('uses the same ignore and output coordinates for absolute and relative scan roots', async () => {
    const directory = mkdtempSync(join(process.cwd(), '.pickier-ignore-glob-'))
    try {
      const source = join(directory, 'source')
      mkdirSync(source)
      writeFileSync(join(source, 'ignored.ts'), 'export const ignored = 1\n')
      writeFileSync(join(source, 'keep.ts'), 'export const kept = 1\n')
      const absolute = await glob(['**/*.ts'], { cwd: source, ignore: ['ignored.ts'] })
      expect(absolute).toEqual([join(source, 'keep.ts')])
      const cwd = relative(process.cwd(), source)
      expect(await glob(['**/*.ts'], { cwd, ignore: ['ignored.ts'] })).toEqual(absolute)
      expect(await glob(['**/*.ts'], { cwd, ignore: ['ignored.ts'], absolute: false })).toEqual(['keep.ts'])
      expect(await glob(['keep.ts'], { cwd, ignore: ['ignored.ts'] })).toEqual(absolute)
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('honors discovered and explicit dot-config ignores while enforcing maxWarnings', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pickier-literal-ignore-'))
    const cli = resolve(import.meta.dir, '../../bin/cli.ts')
    try {
      mkdirSync(join(directory, '.config'))
      writeFileSync(join(directory, '.config/pickier.ts'), "export default { ignores: ['CHANGELOG.md'], lint: { extensions: ['ts', 'md'], maxWarnings: 2 }, rules: { noConsole: 'warn' } }\n")
      writeFileSync(join(directory, 'CHANGELOG.md'), '# Release\n\n# Release\n\n# Release\n\n# Release\n')
      writeFileSync(join(directory, 'index.ts'), 'console.log(1)\n')
      const env = { ...process.env }
      delete env.PICKIER_NO_AUTO_CONFIG
      const lint = (args: string[]) => {
        const result = Bun.spawnSync([process.execPath, cli, '.', ...args], { cwd: directory, env, timeout: 5000 })
        expect(result.signalCode ?? null).toBeNull()
        return { exit: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
      }
      for (const args of [[], ['--config', '.config/pickier.ts']]) {
        const result = lint(args)
        expect(result.exit, result.output).toBe(0)
        expect(result.output).not.toContain('CHANGELOG.md')
        expect(result.output).toContain('index.ts')
        expect(result.output).toContain('1 warning')
      }
      writeFileSync(join(directory, 'second.ts'), 'console.log(2)\n')
      writeFileSync(join(directory, 'third.ts'), 'console.log(3)\n')
      const overLimit = lint([])
      expect(overLimit.exit, overLimit.output).toBe(1)
      expect(overLimit.output).not.toContain('CHANGELOG.md')
      expect(overLimit.output).toContain('3 warnings')
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('applies the same literal ignores when checking formatting', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pickier-format-ignore-'))
    try {
      mkdirSync(join(directory, '.config'))
      writeFileSync(join(directory, '.config/pickier.ts'), "export default { ignores: ['ignored.ts'] }\n")
      writeFileSync(join(directory, 'ignored.ts'), 'export const value=1;\n')
      writeFileSync(join(directory, 'index.ts'), 'export const value = 1\n')
      const env = { ...process.env }
      delete env.PICKIER_NO_AUTO_CONFIG
      const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, '../../bin/cli.ts'), '.', '--format', '--check'], { cwd: directory, env, timeout: 5000 })
      const output = result.stdout.toString() + result.stderr.toString()
      expect(result.signalCode ?? null).toBeNull()
      expect(result.exitCode, output).toBe(0)
      expect(output).not.toContain('ignored.ts')
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
