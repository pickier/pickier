import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

async function main() {
  const owner = resolve(import.meta.dir, '..')
  const repository = resolve(owner, '../..')
  const evidence = process.env.PICKIER_PACKAGE_EVIDENCE ?? tmpdir()
  await mkdir(evidence, { recursive: true })
  const directory = await mkdtemp(join(evidence, 'pickier-package-'))
  const archive = process.env.PICKIER_PACKAGE_ARCHIVE ? resolve(process.env.PICKIER_PACKAGE_ARCHIVE) : join(directory, 'package.tgz')
  const receipt: Record<string, unknown> = { directory, archive, kind: process.env.PICKIER_PACKAGE_ARCHIVE ? 'supplied original archive' : 'normally packed source candidate', completed: false }
  async function run(args: string[], cwd: string, environment: Record<string, string | undefined> = process.env) {
    const child = Bun.spawn([process.execPath, '--no-env-file', ...args], { cwd, env: environment, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    const output = stdout + stderr
    return { code, output }
  }
  try {
    // Inputs are built explicitly before this gate, including required native
    // assets in publication. This verifier does not rebuild or repair them.
    if (!process.env.PICKIER_PACKAGE_ARCHIVE) {
      const packed = await run(['pm', 'pack', '--filename', archive], owner)
      await writeFile(join(directory, 'pack.log'), packed.output)
      if (packed.code) throw new Error(`Normal packing failed with ${packed.code}`)
    }
    const bytes = new Uint8Array(await readFile(archive))
    const files = await new Bun.Archive(bytes).files()
    const manifest = await files.get('package/package.json')?.json()
    if (manifest?.name !== 'pickier' || typeof manifest.version !== 'string') throw new Error('Archive must contain the Pickier package manifest')
    receipt.version = manifest.version
    receipt.sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
    receipt.files = files.size
    const checked = await run(['test', 'packages/pickier/test/format/type-only-import-consumer.test.ts'], repository, {
      ...process.env,
      PICKIER_NO_AUTO_CONFIG: '1',
      PICKIER_IMPORT_EVIDENCE: directory,
      PICKIER_FORMATTER_PACKAGE: undefined,
      PICKIER_FORMATTER_ARCHIVE: archive,
      PICKIER_FORMATTER_VERSION: manifest.version,
    })
    await writeFile(join(directory, 'consumer.log'), checked.output)
    if (checked.code) throw new Error(`Installed Pickier SDK and CLI consumer failed with ${checked.code}; see ${directory}/consumer.log`)
    receipt.completed = true
    console.log(`Pickier package gate PASS: ${directory}`)
  }
  finally {
    await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2))
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
