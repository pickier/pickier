import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Config discovery through the real CLI, in throwaway projects.
 *
 * getConfig skips bunfig when no config can exist (see `mayHaveConfig` in
 * config.ts); these pin down that every place bunfig looks still counts, and
 * that look-alikes such as `eslint.config.js` do not. Each run gets its own
 * HOME so the machine's home directory cannot change the answer, and runs
 * without the suite's PICKIER_NO_AUTO_CONFIG.
 */
const CLI = resolve(__dirname, '../../bin/cli.ts')
const root = mkdtempSync(join(tmpdir(), 'pickier-config-discovery-'))
const home = join(root, '_home')
mkdirSync(home)

afterAll(() => rmSync(root, { recursive: true, force: true }))

const DOUBLE_QUOTES = 'export default { format: { quotes: \'double\' } }\n'

/** Format-check `x.ts` holding `const x = "hi"`: 0 if double quotes are configured, 1 under the defaults. */
function checkDoubleQuotes(name: string, files: Record<string, string>, env: Record<string, string> = {}): number {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'x.ts'), 'const x = "hi"\n')
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true })
    writeFileSync(join(dir, file), content)
  }
  const childEnv: Record<string, string> = { ...process.env as Record<string, string>, HOME: home, ...env }
  delete childEnv.PICKIER_NO_AUTO_CONFIG
  const r = Bun.spawnSync(['bun', CLI, 'run', 'x.ts', '--mode', 'format', '--check'], { cwd: dir, env: childEnv })
  return r.exitCode
}

describe('config discovery', () => {
  it('uses the defaults when there is no config', () => {
    expect(checkDoubleQuotes('none', {})).toBe(1)
  })

  it('finds pickier.config.ts in the project', () => {
    expect(checkDoubleQuotes('root-config', { 'pickier.config.ts': DOUBLE_QUOTES })).toBe(0)
  })

  it('finds an alias under config/', () => {
    expect(checkDoubleQuotes('alias-config-dir', { 'config/lint.ts': DOUBLE_QUOTES })).toBe(0)
  })

  it('finds .config/pickier.ts', () => {
    expect(checkDoubleQuotes('dot-config', { '.config/pickier.ts': DOUBLE_QUOTES })).toBe(0)
  })

  it('reads an alias key from package.json', () => {
    expect(checkDoubleQuotes('package-key', { 'package.json': '{"name":"x","code-style":{"format":{"quotes":"double"}}}' })).toBe(0)
  })

  it('applies PICKIER_* environment variables', () => {
    expect(checkDoubleQuotes('env', {}, { PICKIER_FORMAT_QUOTES: 'double' })).toBe(0)
  })

  it('does not treat other tools\' configs as pickier config', () => {
    expect(checkDoubleQuotes('other-tools', {
      'eslint.config.js': 'export default []\n',
      '.markdownlint.jsonc': '{}\n',
      'package.json': '{"name":"x","scripts":{"lint":"pickier ."},"eslintConfig":{}}',
    })).toBe(1)
  })
})
