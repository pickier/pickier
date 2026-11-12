import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

async function verify(): Promise<void> {
  assert(process.argv[2], 'Pass the actual source-built native CLI')
  const cli = resolve(process.argv[2])
  const root = await mkdtemp(join(tmpdir(), 'pickier-native-read-only-'))
  const original = 'export const x = "hello"  \n\n\n'
  try {
    for (const kind of ['file', 'directory']) {
      const directory = join(root, kind)
      await mkdir(directory)
      const file = join(directory, 'entry.ts')
      const target = kind === 'file' ? file : directory
      const run = (...flags: string[]) => Bun.spawnSync([cli, 'format', target, ...flags], { cwd: root, timeout: 5000 })
      await writeFile(file, original)
      assert.equal(run('--write').exitCode, 0)
      const formatted = await readFile(file, 'utf8')
      assert.notEqual(formatted, original, 'The real native write control must format the fixture')
      for (const guard of ['--dry-run', '--check']) {
        await writeFile(file, original)
        const result = run('--write', guard)
        assert.equal(await readFile(file, 'utf8'), original, `${kind} ${guard} must preserve original bytes`)
        assert.equal(result.exitCode, 1, `${kind} ${guard} must report required formatting`)
        await writeFile(file, formatted)
        assert.equal(run('--write', guard).exitCode, 0)
        assert.equal(await readFile(file, 'utf8'), formatted)
      }
    }
    process.stdout.write('Native format dry-run/check: unchanged file/directory bytes, dirty/clean status and actual write controls PASS\n')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}

verify().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
