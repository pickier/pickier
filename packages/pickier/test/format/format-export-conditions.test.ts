import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { formatCode } from '../../src/format'

describe('package export condition semantics', () => {
  it('keeps the runtime entrypoint selected before formatting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pickier-export-conditions-'))
    try {
      const pkg = join(dir, 'node_modules', 'condition-order-fixture')
      mkdirSync(pkg, { recursive: true })
      const manifest = join(pkg, 'package.json')
      writeFileSync(manifest, JSON.stringify({
        name: 'condition-order-fixture',
        type: 'module',
        exports: {
          '.': {
            types: './index.d.ts',
            bun: './bun.js',
            import: './import.js',
            default: './default.js',
          },
        },
      }))
      for (const name of ['bun', 'import', 'default'])
        writeFileSync(join(pkg, `${name}.js`), `export default '${name}'\n`)
      const resolve = () => {
        const result = Bun.spawnSync([process.execPath, '--eval', "console.log((await import('condition-order-fixture')).default)"], {
          cwd: dir,
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 2000,
        })
        expect(result.exitCode).toBe(0)
        expect(result.stderr.toString()).toBe('')
        return result.stdout.toString().trim()
      }
      expect(resolve()).toBe('bun')
      writeFileSync(manifest, formatCode(readFileSync(manifest, 'utf8'), defaultConfig, manifest))
      expect(resolve()).toBe('bun')
      const formatted = readFileSync(manifest, 'utf8')
      expect(Object.keys(JSON.parse(formatted).exports['.'])).toEqual(['types', 'bun', 'import', 'default'])
      expect(formatCode(formatted, defaultConfig, manifest)).toBe(formatted)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves condition priority and fallback order in every export shape', () => {
    const shapes = [
      { development: './dev.js', node: './node.js', default: './fallback.js' },
      { '.': { browser: { development: './dev.js', default: './browser.js' }, node: './node.js', default: './index.js' } },
      { './feature': [{ custom: './custom.js', default: './feature.js' }, './legacy.js'], '.': null },
      [{ node: './node.js', default: './index.js' }, './fallback.js'],
      './index.js',
      null,
    ]
    for (const exports of shapes) {
      const source = JSON.stringify({ name: 'fixture', exports })
      const formatted = formatCode(source, defaultConfig, 'package.json')
      expect(JSON.stringify(JSON.parse(formatted).exports)).toBe(JSON.stringify(exports))
      expect(formatCode(formatted, defaultConfig, 'package.json')).toBe(formatted)
    }
  })
})
