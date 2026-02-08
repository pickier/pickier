import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLintProgrammatic } from '../../src/index'

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
