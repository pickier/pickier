import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CLI = resolve(__dirname, '../../bin/cli.ts')
const dir = mkdtempSync(join(tmpdir(), 'pickier-cli-ext-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

// A formatted Markdown file next to a TypeScript file that is not formatted
writeFileSync(join(dir, 'doc.md'), '# Title\n\nText.\n')
writeFileSync(join(dir, 'code.ts'), 'const x = "not single quoted"\n')

function check(...args: string[]): number {
  return Bun.spawnSync(['bun', CLI, 'run', dir, '--mode', 'format', '--check', ...args], { cwd: dir }).exitCode
}

describe('--ext on the fast path', () => {
  it('checks every default extension without it', () => {
    expect(check()).toBe(1)
  })

  it('checks only the listed extensions with it', () => {
    expect(check('--ext', 'md')).toBe(0)
    expect(check('--ext', 'ts')).toBe(1)
  })
})
