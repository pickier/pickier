import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { runFormat } from '../../src/formatter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-format-json-'))
}

describe('JSON formatting', () => {
  it('sorts package.json keys according to canonical order', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    const unsorted = JSON.stringify({
      devDependencies: { 'z-package': '^1.0.0', 'a-package': '^1.0.0' },
      name: 'test',
      scripts: { test: 'test', build: 'build' },
      version: '1.0.0',
      dependencies: { 'z-dep': '^1.0.0', 'a-dep': '^1.0.0' },
      type: 'module',
      description: 'A test package',
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    // Check key order
    const keys = Object.keys(parsed)
    expect(keys[0]).toBe('name')
    expect(keys[1]).toBe('type')
    expect(keys[2]).toBe('version')
    expect(keys[3]).toBe('description')

    // Check dependencies are sorted alphabetically
    expect(Object.keys(parsed.dependencies)[0]).toBe('a-dep')
    expect(Object.keys(parsed.dependencies)[1]).toBe('z-dep')
    expect(Object.keys(parsed.devDependencies)[0]).toBe('a-package')
    expect(Object.keys(parsed.devDependencies)[1]).toBe('z-package')
  })

  it('sorts package.json files array alphabetically', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    const unsorted = JSON.stringify({
      name: 'test',
      files: ['src', 'bin', 'README.md', 'dist'],
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    expect(parsed.files).toEqual(['README.md', 'bin', 'dist', 'src'])
  })

  it('preserves authored package.json export condition priority', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    const unsorted = JSON.stringify({
      name: 'test',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          browser: './dist/browser.js',
          import: './dist/index.mjs',
          default: './dist/index.js',
        },
      },
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    expect(Object.keys(parsed.exports['.'])).toEqual(['types', 'browser', 'import', 'default'])
  })

  it('sorts package.json git hooks in canonical order', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    const unsorted = JSON.stringify({
      name: 'test',
      husky: {
        'post-commit': 'echo post',
        'pre-commit': 'echo pre',
        'commit-msg': 'echo msg',
      },
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    const hookKeys = Object.keys(parsed.husky)
    expect(hookKeys[0]).toBe('pre-commit')
    expect(hookKeys[1]).toBe('commit-msg')
    expect(hookKeys[2]).toBe('post-commit')
  })

  it('sorts tsconfig.json keys according to canonical order', async () => {
    const dir = tmp()
    const file = join(dir, 'tsconfig.json')
    const unsorted = JSON.stringify({
      include: ['src'],
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        strict: true,
      },
      exclude: ['node_modules'],
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    // Check top-level key order
    const keys = Object.keys(parsed)
    expect(keys.indexOf('compilerOptions')).toBeLessThan(keys.indexOf('include'))
    expect(keys.indexOf('include')).toBeLessThan(keys.indexOf('exclude'))
  })

  it('sorts tsconfig.json compilerOptions with canonical order', async () => {
    const dir = tmp()
    const file = join(dir, 'tsconfig.json')
    const unsorted = JSON.stringify({
      compilerOptions: {
        strict: true,
        esModuleInterop: true,
        target: 'ES2020',
        module: 'ESNext',
        lib: ['ES2020'],
      },
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    const compilerKeys = Object.keys(parsed.compilerOptions)
    // target should come before module and strict
    expect(compilerKeys.indexOf('target')).toBeLessThan(compilerKeys.indexOf('module'))
    expect(compilerKeys.indexOf('target')).toBeLessThan(compilerKeys.indexOf('strict'))
  })

  it('handles malformed JSON gracefully', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    const malformed = '{ name: "test", invalid json }'

    writeFileSync(file, malformed, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    // Should not crash - formatter may normalize newlines but won't parse malformed JSON
    const result = readFileSync(file, 'utf8')
    // Formatter adds final newline
    expect(result.includes('{ name: "test", invalid json }')).toBe(true)
  })

  it('sorts pnpm.overrides nested object', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    const unsorted = JSON.stringify({
      name: 'test',
      pnpm: {
        overrides: {
          'z-package': '^1.0.0',
          'a-package': '^2.0.0',
          'm-package': '^3.0.0',
        },
      },
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    const overrideKeys = Object.keys(parsed.pnpm.overrides)
    expect(overrideKeys).toEqual(['a-package', 'm-package', 'z-package'])
  })

  it('sorts all dependency-like fields', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    const unsorted = JSON.stringify({
      name: 'test',
      peerDependencies: { z: '1', a: '1' },
      optionalDependencies: { z: '1', a: '1' },
      peerDependenciesMeta: { z: {}, a: {} },
      overrides: { z: '1', a: '1' },
      resolutions: { z: '1', a: '1' },
    }, null, 2)

    writeFileSync(file, unsorted, 'utf8')
    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    const parsed = JSON.parse(result)

    expect(Object.keys(parsed.peerDependencies)).toEqual(['a', 'z'])
    expect(Object.keys(parsed.optionalDependencies)).toEqual(['a', 'z'])
    expect(Object.keys(parsed.peerDependenciesMeta)).toEqual(['a', 'z'])
    expect(Object.keys(parsed.overrides)).toEqual(['a', 'z'])
    expect(Object.keys(parsed.resolutions)).toEqual(['a', 'z'])
  })

  it('handles empty JSON files', async () => {
    const dir = tmp()
    const file = join(dir, 'package.json')
    writeFileSync(file, '{}', 'utf8')

    const code = await runFormat([dir], { write: true })
    expect(code).toBe(0)

    const result = readFileSync(file, 'utf8')
    // Formatter adds final newline
    expect(result).toBe('{}\n')
  })
})
