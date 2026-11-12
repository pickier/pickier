import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runUnified } from '../../src/run'

const root = mkdtempSync(join(tmpdir(), 'pickier-read-only-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const original = 'export const x = "hello"  \n\n\n'
let sequence = 0
function fixture(kind: string) {
  const directory = join(root, String(sequence++))
  mkdirSync(directory)
  const file = join(directory, 'entry.ts')
  writeFileSync(file, original)
  return { file, target: kind === 'file' ? file : kind === 'directory' ? directory : join(directory, '*.ts') }
}

for (const kind of ['file', 'directory', 'glob']) {
  for (const mode of ['format', 'auto'] as const) {
    for (const guard of ['dryRun', 'check'] as const) {
      for (const writeFlag of ['write', 'fix'] as const) {
        test(`${mode} API ${guard} overrides ${writeFlag} for a ${kind}`, async () => {
          const { file, target } = fixture(kind)
          const code = await runUnified([target], { mode, [guard]: true, [writeFlag]: true })
          expect(readFileSync(file, 'utf8')).toBe(original)
          expect(code).toBe(mode === 'format' ? 1 : 0)
        })
      }
    }
  }
  for (const args of [
    ['--format', '--dry-run'],
    ['run', '--mode', 'format', '--write', '--dry-run'],
    ['run', '--mode', 'format', '--write', '--check'],
    ['run', '--mode', 'auto', '--write', '--dry-run'],
    ['run', '--mode', 'auto', '--fix', '--dry-run'],
  ]) {
    test(`real CLI ${args.join(' ')} preserves a ${kind}`, () => {
      const { file, target } = fixture(kind)
      const command = args[0] === 'run' ? ['run', target, ...args.slice(1)] : [target, ...args]
      const child = Bun.spawnSync([process.execPath, resolve(import.meta.dir, '../../bin/cli.ts'), ...command], {
        env: { ...process.env, PICKIER_NO_AUTO_CONFIG: '1' }, timeout: 5000,
      })
      expect(readFileSync(file, 'utf8')).toBe(original)
      expect(child.exitCode).toBe(args.includes('auto') ? 0 : 1)
    })
  }
}

test('clean format checks with write flags succeed without changing bytes', async () => {
  for (const kind of ['file', 'directory', 'glob']) {
    const { file, target } = fixture(kind)
    const formatted = "export const x = 'hello'\n"
    writeFileSync(file, formatted)
    expect(await runUnified([target], { mode: 'format', write: true, check: true })).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(formatted)
  }
})
