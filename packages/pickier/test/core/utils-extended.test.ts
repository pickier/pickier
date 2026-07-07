import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import process from 'node:process'
import { createIgnoreMatcher, expandPatterns, getRuleSetting, isCodeFile, shouldIgnorePath } from '../../src/utils'

process.env.PICKIER_NO_AUTO_CONFIG = '1'

describe('expandPatterns', () => {
  it('expands bare directory to glob pattern', () => {
    expect(expandPatterns(['src'])).toEqual(['src/**/*'])
  })

  it('strips trailing slash before expansion', () => {
    expect(expandPatterns(['src/'])).toEqual(['src/**/*'])
  })

  it('keeps glob patterns as-is', () => {
    expect(expandPatterns(['**/*.ts'])).toEqual(['**/*.ts'])
    expect(expandPatterns(['src/**/*.{ts,tsx}'])).toEqual(['src/**/*.{ts,tsx}'])
  })

  it('keeps file paths with extensions as-is', () => {
    expect(expandPatterns(['file.ts'])).toEqual(['file.ts'])
    expect(expandPatterns(['src/file.json'])).toEqual(['src/file.json'])
  })

  it('handles multiple patterns', () => {
    expect(expandPatterns(['src', '**/*.ts', 'file.js'])).toEqual([
      'src/**/*',
      '**/*.ts',
      'file.js',
    ])
  })

  it('recognizes glob special characters', () => {
    // All of these should be kept as-is
    expect(expandPatterns(['foo*'])).toEqual(['foo*'])
    expect(expandPatterns(['foo?'])).toEqual(['foo?'])
    expect(expandPatterns(['foo[abc]'])).toEqual(['foo[abc]'])
    expect(expandPatterns(['foo{a,b}'])).toEqual(['foo{a,b}'])
    expect(expandPatterns(['!(foo)'])).toEqual(['!(foo)'])
  })

  it('handles empty array', () => {
    expect(expandPatterns([])).toEqual([])
  })

  it('handles dot directory', () => {
    expect(expandPatterns(['.'])).toEqual(['./**/*'])
  })
})

describe('isCodeFile', () => {
  it('returns true for matching extensions', () => {
    const exts = new Set(['.ts', '.js', '.json'])
    expect(isCodeFile('file.ts', exts)).toBe(true)
    expect(isCodeFile('file.js', exts)).toBe(true)
    expect(isCodeFile('file.json', exts)).toBe(true)
  })

  it('returns false for non-matching extensions', () => {
    const exts = new Set(['.ts', '.js'])
    expect(isCodeFile('file.py', exts)).toBe(false)
    expect(isCodeFile('file.css', exts)).toBe(false)
  })

  it('returns false for files without extensions', () => {
    const exts = new Set(['.ts', '.js'])
    expect(isCodeFile('Makefile', exts)).toBe(false)
    expect(isCodeFile('README', exts)).toBe(false)
  })

  it('handles dot in directory path', () => {
    const exts = new Set(['.ts'])
    expect(isCodeFile('src/my.dir/file.ts', exts)).toBe(true)
  })

  it('uses last extension only', () => {
    const exts = new Set(['.ts'])
    // .test.ts → last extension is .ts
    expect(isCodeFile('file.test.ts', exts)).toBe(true)
  })
})

describe('shouldIgnorePath', () => {
  const cwd = process.cwd()

  it('ignores node_modules paths', () => {
    expect(shouldIgnorePath(
      join(cwd, 'node_modules/foo/bar.ts'),
      ['**/node_modules/**'],
    )).toBe(true)
  })

  it('ignores dist paths', () => {
    expect(shouldIgnorePath(
      join(cwd, 'dist/index.js'),
      ['**/dist/**'],
    )).toBe(true)
  })

  it('ignores .git paths', () => {
    expect(shouldIgnorePath(
      join(cwd, '.git/config'),
      ['**/.git/**'],
    )).toBe(true)
  })

  it('does not ignore normal source files', () => {
    expect(shouldIgnorePath(
      join(cwd, 'src/index.ts'),
      ['**/node_modules/**', '**/dist/**'],
    )).toBe(false)
  })

  it('handles file extension patterns (**/*.test.ts)', () => {
    expect(shouldIgnorePath(
      join(cwd, 'src/foo.test.ts'),
      ['**/*.test.ts'],
    )).toBe(true)
    expect(shouldIgnorePath(
      join(cwd, 'src/foo.ts'),
      ['**/*.test.ts'],
    )).toBe(false)
  })

  it('handles dot-prefixed directory patterns', () => {
    expect(shouldIgnorePath(
      join(cwd, '.cache/file.js'),
      ['**/.cache/**'],
    )).toBe(true)
  })

  it('handles nested paths', () => {
    expect(shouldIgnorePath(
      join(cwd, 'packages/foo/node_modules/bar/index.js'),
      ['**/node_modules/**'],
    )).toBe(true)
  })

  it('handles empty ignore list', () => {
    expect(shouldIgnorePath(
      join(cwd, 'src/index.ts'),
      [],
    )).toBe(false)
  })

  it('handles paths outside project (only universal ignores apply)', () => {
    // Paths outside the project should only be matched by universal ignores
    expect(shouldIgnorePath(
      '/tmp/external/node_modules/foo.js',
      ['**/node_modules/**', '**/custom-dir/**'],
    )).toBe(true)
  })

  it('reuses compiled ignore matchers', () => {
    const matcher = createIgnoreMatcher(['**/node_modules/**', '**/*.test.ts'])
    expect(matcher(join(cwd, 'node_modules/foo/bar.ts'))).toBe(true)
    expect(matcher(join(cwd, 'src/foo.test.ts'))).toBe(true)
    expect(matcher(join(cwd, 'src/foo.ts'))).toBe(false)
  })

  it('treats sibling dirs sharing a name prefix as outside the project', () => {
    // /project-data is NOT inside /project — project-specific ignores must not apply
    const matcher = createIgnoreMatcher(['**/custom-dir/**'], '/home/user/project')
    expect(matcher('/home/user/project/custom-dir/a.ts')).toBe(true)
    expect(matcher('/home/user/project-data/custom-dir/a.ts')).toBe(false)
  })
})

describe('getRuleSetting', () => {
  it('parses "error" severity', () => {
    const result = getRuleSetting({ myRule: 'error' }, 'myRule')
    expect(result).toEqual({ enabled: true, severity: 'error', options: undefined })
  })

  it('parses "warn" severity', () => {
    const result = getRuleSetting({ myRule: 'warn' }, 'myRule')
    expect(result).toEqual({ enabled: true, severity: 'warning', options: undefined })
  })

  it('parses "warning" severity', () => {
    const result = getRuleSetting({ myRule: 'warning' as any }, 'myRule')
    expect(result).toEqual({ enabled: true, severity: 'warning', options: undefined })
  })

  it('parses "off" as disabled', () => {
    const result = getRuleSetting({ myRule: 'off' }, 'myRule')
    expect(result).toEqual({ enabled: false, severity: undefined, options: undefined })
  })

  it('parses array format ["error", options]', () => {
    const opts = { allowedHosts: ['npm'] }
    const result = getRuleSetting({ myRule: ['error', opts] }, 'myRule')
    expect(result).toEqual({ enabled: true, severity: 'error', options: opts })
  })

  it('parses array format ["warn", options]', () => {
    const opts = { max: 5 }
    const result = getRuleSetting({ myRule: ['warn', opts] }, 'myRule')
    expect(result).toEqual({ enabled: true, severity: 'warning', options: opts })
  })

  it('parses array format ["off", options] as disabled but preserves options', () => {
    const result = getRuleSetting({ myRule: ['off', {}] }, 'myRule')
    expect(result.enabled).toBe(false)
    expect(result.severity).toBeUndefined()
    // options are still extracted from the array even when severity is off
    expect(result.options).toEqual({})
  })

  it('handles missing rule', () => {
    const result = getRuleSetting({}, 'nonExistent')
    expect(result).toEqual({ enabled: false, severity: undefined, options: undefined })
  })
})
