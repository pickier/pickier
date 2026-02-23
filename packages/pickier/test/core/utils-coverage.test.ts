import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expandPatterns, isCodeFile, shouldIgnorePath } from '../../src/utils'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-utils-'))
}

// ─── expandPatterns ──────────────────────────────────────────────────────────

describe('expandPatterns', () => {
  it('expands plain directory to glob', () => {
    const result = expandPatterns(['src'])
    expect(result[0]).toBe('src/**/*')
  })

  it('keeps glob patterns as-is', () => {
    const result = expandPatterns(['src/**/*.ts'])
    expect(result[0]).toBe('src/**/*.ts')
  })

  it('keeps file paths with extensions as-is', () => {
    const result = expandPatterns(['src/file.ts'])
    expect(result[0]).toBe('src/file.ts')
  })

  it('strips trailing slash from directory', () => {
    const result = expandPatterns(['src/'])
    expect(result[0]).toBe('src/**/*')
  })

  it('handles multiple patterns', () => {
    const result = expandPatterns(['src', 'lib/**/*.ts', 'test.ts'])
    expect(result[0]).toBe('src/**/*')
    expect(result[1]).toBe('lib/**/*.ts')
    expect(result[2]).toBe('test.ts')
  })

  it('handles patterns with ? glob char', () => {
    const result = expandPatterns(['src/file?.ts'])
    expect(result[0]).toBe('src/file?.ts')
  })

  it('handles patterns with [] glob chars', () => {
    const result = expandPatterns(['src/[abc].ts'])
    expect(result[0]).toBe('src/[abc].ts')
  })

  it('handles patterns with {} glob chars', () => {
    const result = expandPatterns(['{src,lib}'])
    expect(result[0]).toBe('{src,lib}')
  })

  it('handles patterns with ! glob char', () => {
    const result = expandPatterns(['!node_modules'])
    expect(result[0]).toBe('!node_modules')
  })
})

// ─── isCodeFile ──────────────────────────────────────────────────────────────

describe('isCodeFile', () => {
  it('returns true for file with matching extension', () => {
    const exts = new Set(['.ts', '.js'])
    expect(isCodeFile('src/file.ts', exts)).toBe(true)
  })

  it('returns false for file with non-matching extension', () => {
    const exts = new Set(['.ts', '.js'])
    expect(isCodeFile('src/file.md', exts)).toBe(false)
  })

  it('returns false for file without extension', () => {
    const exts = new Set(['.ts', '.js'])
    expect(isCodeFile('Makefile', exts)).toBe(false)
  })

  it('handles .js extension', () => {
    const exts = new Set(['.ts', '.js'])
    expect(isCodeFile('src/file.js', exts)).toBe(true)
  })
})

// ─── shouldIgnorePath ────────────────────────────────────────────────────────

describe('shouldIgnorePath', () => {
  it('ignores paths matching **/node_modules/**', () => {
    const cwd = process.cwd()
    const path = join(cwd, 'node_modules', 'some-pkg', 'index.js')
    expect(shouldIgnorePath(path, ['**/node_modules/**'])).toBe(true)
  })

  it('ignores paths matching **/dist/**', () => {
    const cwd = process.cwd()
    const path = join(cwd, 'dist', 'index.js')
    expect(shouldIgnorePath(path, ['**/dist/**'])).toBe(true)
  })

  it('does not ignore paths not matching any pattern', () => {
    const cwd = process.cwd()
    const path = join(cwd, 'src', 'index.ts')
    expect(shouldIgnorePath(path, ['**/node_modules/**'])).toBe(false)
  })

  it('ignores test files matching **/*.test.ts pattern', () => {
    const cwd = process.cwd()
    const path = join(cwd, 'src', 'foo.test.ts')
    expect(shouldIgnorePath(path, ['**/*.test.ts'])).toBe(true)
  })

  it('does not ignore non-test files when only test pattern given', () => {
    const cwd = process.cwd()
    const path = join(cwd, 'src', 'foo.ts')
    expect(shouldIgnorePath(path, ['**/*.test.ts'])).toBe(false)
  })

  it('handles empty ignore list', () => {
    const cwd = process.cwd()
    const path = join(cwd, 'src', 'index.ts')
    expect(shouldIgnorePath(path, [])).toBe(false)
  })

  it('ignores paths matching **/name pattern', () => {
    const cwd = process.cwd()
    const path = join(cwd, 'some', 'dir', 'coverage')
    expect(shouldIgnorePath(path, ['**/coverage'])).toBe(true)
  })
})

// ─── loadConfigFromPath ──────────────────────────────────────────────────────

describe('loadConfigFromPath', () => {
  it('loads JSON config file', async () => {
    const dir = tmp()
    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: true,
      lint: { extensions: ['ts', 'js'] },
    }), 'utf8')
    const { loadConfigFromPath } = await import('../../src/utils')
    const cfg = await loadConfigFromPath(cfgPath)
    expect(cfg.verbose).toBe(true)
    expect(cfg.lint.extensions).toContain('ts')
  })

  it('returns default config when no path given and NO_AUTO_CONFIG set', async () => {
    process.env.PICKIER_NO_AUTO_CONFIG = '1'
    const { loadConfigFromPath } = await import('../../src/utils')
    const cfg = await loadConfigFromPath(undefined)
    expect(cfg).toBeDefined()
    expect(cfg.lint).toBeDefined()
    expect(cfg.format).toBeDefined()
  })

  it('handles relative config path', async () => {
    const dir = tmp()
    const cfgPath = join(dir, 'custom.json')
    writeFileSync(cfgPath, JSON.stringify({ verbose: false }), 'utf8')
    const { loadConfigFromPath } = await import('../../src/utils')
    const cfg = await loadConfigFromPath(cfgPath)
    expect(cfg).toBeDefined()
  })
})

// ─── mergeConfig ─────────────────────────────────────────────────────────────

describe('mergeConfig', () => {
  it('merges ignores from base and override', async () => {
    const { mergeConfig } = await import('../../src/utils')
    const base = { ignores: ['**/node_modules/**'] } as any
    const override = { ignores: ['**/dist/**'] } as any
    const result = mergeConfig(base, override)
    expect(result.ignores).toContain('**/node_modules/**')
    expect(result.ignores).toContain('**/dist/**')
  })

  it('merges pluginRules from base and override', async () => {
    const { mergeConfig } = await import('../../src/utils')
    const base = { pluginRules: { 'rule-a': 'error' } } as any
    const override = { pluginRules: { 'rule-b': 'warn' } } as any
    const result = mergeConfig(base, override)
    expect((result.pluginRules as any)['rule-a']).toBe('error')
    expect((result.pluginRules as any)['rule-b']).toBe('warn')
  })

  it('override pluginRules take precedence over base', async () => {
    const { mergeConfig } = await import('../../src/utils')
    const base = { pluginRules: { 'rule-a': 'error' } } as any
    const override = { pluginRules: { 'rule-a': 'warn' } } as any
    const result = mergeConfig(base, override)
    expect((result.pluginRules as any)['rule-a']).toBe('warn')
  })

  it('auto-enables sort-tailwind-classes when tailwind.enabled is true', async () => {
    const { mergeConfig } = await import('../../src/utils')
    const base = {} as any
    const override = { tailwind: { enabled: true } } as any
    const result = mergeConfig(base, override)
    expect((result.pluginRules as any)['pickier/sort-tailwind-classes']).toBe('warn')
  })

  it('does not override explicit sort-tailwind-classes config', async () => {
    const { mergeConfig } = await import('../../src/utils')
    const base = {} as any
    const override = { tailwind: { enabled: true }, pluginRules: { 'pickier/sort-tailwind-classes': 'off' } } as any
    const result = mergeConfig(base, override)
    expect((result.pluginRules as any)['pickier/sort-tailwind-classes']).toBe('off')
  })
})
