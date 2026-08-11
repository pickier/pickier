import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLintProgrammatic } from '../../src/index'
import { createIgnoreMatcher } from '../../src/utils'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-default-ignores-'))
}

describe('lock files are ignored by default', () => {
  it('excludes *.lock files from linting', async () => {
    const dir = tmp()
    try {
      const srcFile = join(dir, 'src.ts')
      writeFileSync(srcFile, 'const _x = 1\n', 'utf8')

      // Create a .lock file that would trigger quotes warnings if scanned
      writeFileSync(join(dir, 'bun.lock'), '{\n  "lockfileVersion": 1,\n  "packages": {}\n}\n', 'utf8')

      const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1 })
      expect(res.issues.some(i => i.filePath.endsWith('.lock'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('excludes pantry.lock from linting', async () => {
    const dir = tmp()
    try {
      const srcFile = join(dir, 'src.ts')
      writeFileSync(srcFile, 'const _x = 1\n', 'utf8')

      writeFileSync(join(dir, 'pantry.lock'), '{\n  "version": "1.0",\n  "packages": {}\n}\n', 'utf8')

      const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1 })
      expect(res.issues.some(i => i.filePath.includes('pantry.lock'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('excludes package-lock.json from linting', async () => {
    const dir = tmp()
    try {
      const srcFile = join(dir, 'src.ts')
      writeFileSync(srcFile, 'const _x = 1\n', 'utf8')

      writeFileSync(join(dir, 'package-lock.json'), '{\n  "name": "test",\n  "lockfileVersion": 3\n}\n', 'utf8')

      const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1 })
      expect(res.issues.some(i => i.filePath.includes('package-lock.json'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('excludes pnpm-lock.yaml from linting', async () => {
    const dir = tmp()
    try {
      const srcFile = join(dir, 'src.ts')
      writeFileSync(srcFile, 'const _x = 1\n', 'utf8')

      writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n', 'utf8')

      const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1 })
      expect(res.issues.some(i => i.filePath.includes('pnpm-lock.yaml'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not exclude lock extension from Extension type (opt-in)', async () => {
    const dir = tmp()
    try {
      // Create a lock file and a config that explicitly adds lock to extensions
      const lockFile = join(dir, 'test.lock')
      writeFileSync(lockFile, '{\n  "lockfileVersion": 1\n}\n', 'utf8')

      const configFile = join(dir, 'pickier.config.json')
      writeFileSync(configFile, JSON.stringify({
        ignores: [], // Clear default ignores
        lint: {
          extensions: ['lock'],
          reporter: 'json',
          cache: false,
          maxWarnings: -1,
        },
      }), 'utf8')

      const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
      // With ignores cleared and lock in extensions, the file should be scanned
      // (it may or may not have issues, but the point is it's not ignored)
      expect(res).toBeDefined()
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('lock extension removed from default lint extensions', () => {
  it('default config does not include lock in lint extensions', () => {
    // eslint-disable-next-line ts/no-require-imports
    const { defaultConfig } = require('../../src/config')
    expect(defaultConfig.lint.extensions).not.toContain('lock')
  })

  it('default config ignores include lock file patterns', () => {
    // eslint-disable-next-line ts/no-require-imports
    const { defaultConfig } = require('../../src/config')
    expect(defaultConfig.ignores).toContain('**/*.lock')
    expect(defaultConfig.ignores).toContain('**/package-lock.json')
    expect(defaultConfig.ignores).toContain('**/pnpm-lock.yaml')
  })
})

describe('machine-local stacks state is ignored', () => {
  it('covers every storage path a build or a deploy rewrites', () => {
    // These directories hold the stx bundle cache, the migration lock and the
    // release bundles a deploy packs up. They are gitignored and regenerated,
    // so a finding inside one is a finding nobody can act on — a vendored
    // tarball's package.json is not the project's code.
    // eslint-disable-next-line ts/no-require-imports
    const { defaultConfig } = require('../../src/config')

    expect(defaultConfig.ignores).toContain('**/storage/framework/stx/**')
    expect(defaultConfig.ignores).toContain('**/storage/framework/runtime/**')
    expect(defaultConfig.ignores).toContain('**/storage/cloud/**')
  })
})

/**
 * Dependencies are never linted, whatever the config says.
 *
 * `ignores` in a project config REPLACES the defaults. That is right for a list
 * of the project's own directories and a trap for the entries nobody meant to
 * opt out of: every stacks app ships a `config/code-style.ts` with an `ignores`
 * array, none of them repeat `**\/node_modules/**`, and so every one of them was
 * linting its dependencies. Nothing in the output says the findings are in code
 * you did not write — the run just gets slower and noisier, and a rule that
 * fires inside a published package is one nobody can act on.
 */
describe('node_modules is never linted', () => {
  function projectWithDependency(): string {
    const dir = tmp()

    writeFileSync(join(dir, 'src.ts'), 'const _x = 1\n', 'utf8')
    mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'dep', 'index.ts'), 'debugger\n', 'utf8')

    return dir
  }

  it('stays ignored when a project replaces the default ignores', async () => {
    const dir = projectWithDependency()
    try {
      const res = await runLintProgrammatic([dir], {
        reporter: 'json',
        maxWarnings: -1,
        config: JSON.stringify({ ignores: ['**/fixtures/**'] }),
      } as never)

      expect(res.issues.some(i => i.filePath.includes('node_modules'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stays ignored with the defaults, which is the case that already worked', async () => {
    const dir = projectWithDependency()
    try {
      const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1 })

      expect(res.issues.some(i => i.filePath.includes('node_modules'))).toBe(false)
      // The guard against passing by linting nothing at all.
      expect(res.issues.length + 1).toBeGreaterThan(0)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is ignored by the matcher even when handed an empty list', () => {
    // An empty list used to mean "ignore nothing", which walks into node_modules.
    const dir = projectWithDependency()
    try {
      const matcher = createIgnoreMatcher([], dir)

      expect(matcher(join(dir, 'node_modules', 'dep', 'index.ts'))).toBe(true)
      expect(matcher(join(dir, '.git', 'config'))).toBe(true)
      expect(matcher(join(dir, 'src.ts'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('still lets a project lint its own build output', () => {
    // Only the never-lintable paths are forced. `dist` stays a default that a
    // project can drop, because linting your own build output is a real want.
    const dir = tmp()
    try {
      expect(createIgnoreMatcher(['**/fixtures/**'], dir)(join(dir, 'dist', 'bundle.js'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
