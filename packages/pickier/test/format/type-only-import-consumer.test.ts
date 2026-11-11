import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defaultConfig } from '../../src/config'
import { formatCode } from '../../src/format'

test('formatted type-only bindings retain strict authored and installed SDK contracts', async () => {
  const evidence = process.env.PICKIER_IMPORT_EVIDENCE ?? tmpdir()
  await mkdir(evidence, { recursive: true })
  const directory = await mkdtemp(join(evidence, 'pickier-type-import-'))
  const library = join(directory, 'library')
  const consumer = join(directory, 'consumer')
  const commands: Array<Record<string, unknown>> = []
  const receipt: Record<string, unknown> = { directory, commands, completed: false }
  const hash = (bytes: Uint8Array): string => new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
  const formatterArchive = process.env.PICKIER_FORMATTER_ARCHIVE
  let formatterFiles: Map<string, File> | undefined
  async function run(args: string[], cwd: string) {
    const child = Bun.spawn([process.execPath, '--no-env-file', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', timeout: 15_000 })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    const output = stdout + stderr
    const log = `${commands.length}.log`
    await writeFile(join(directory, log), output)
    commands.push({ args, code, log })
    return { code, output }
  }
  try {
    let format = formatCode
    let configuration = defaultConfig
    let cli = resolve(import.meta.dir, '../../bin/cli.ts')
    async function selectProducer(root: string) {
      const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      expect(manifest.name).toBe('pickier')
      expect(manifest.version).toBe(process.env.PICKIER_FORMATTER_VERSION)
      const api = await import(pathToFileURL(resolve(root, manifest.exports['.'].import)).href)
      expect(typeof api.formatCode).toBe('function')
      format = api.formatCode
      configuration = api.defaultConfig
      cli = resolve(root, manifest.bin.pickier)
      receipt.producer = { root, version: manifest.version, cli, kind: 'external package' }
    }
    if (process.env.PICKIER_FORMATTER_PACKAGE) await selectProducer(resolve(process.env.PICKIER_FORMATTER_PACKAGE))
    else receipt.producer = { kind: formatterArchive ? 'installed archive' : 'source' }
    await mkdir(library)
    await mkdir(consumer)
    const source = `import type First from 'node:events'
import type { EventEmitter as Named } from 'node:events'
import type * as Events from 'node:events'
import { type EventEmitter as Inline } from 'node:events'
import { captureRejections, type EventEmitter as AfterUnused } from 'node:events'
import FirstRuntime from 'node:events'
import SecondRuntime from 'node:events'
import * as RuntimeEvents from 'node:events'
import { EventEmitter as RuntimeEmitter } from 'node:events'
export type Result = [First, Named, Events.EventEmitter, Inline, AfterUnused]
export const sameEmitter = FirstRuntime === SecondRuntime && FirstRuntime === RuntimeEvents.EventEmitter && RuntimeEmitter === RuntimeEvents.EventEmitter
`
    await writeFile(join(library, 'index.ts'), source)
    await writeFile(join(library, 'package.json'), JSON.stringify({ name: 'type-import-fixture', version: '1.0.0', type: 'module', exports: './index.ts' }))
    const manifest = { name: 'type-import-consumer', private: true, type: 'module', devDependencies: { typescript: '7.0.2', '@types/bun': '1.4.4' }, dependencies: {} as Record<string, string> }
    if (formatterArchive) {
      manifest.dependencies.pickier = `file:${resolve(formatterArchive)}`
      const bytes = new Uint8Array(await readFile(formatterArchive))
      formatterFiles = await new Bun.Archive(bytes).files()
      receipt.formatterArchiveSHA256 = hash(bytes)
      expect(await formatterFiles.get('package/package.json')!.json()).toMatchObject({ name: 'pickier', version: process.env.PICKIER_FORMATTER_VERSION })
    }
    await writeFile(join(consumer, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(consumer, '.npmrc'), 'registry=https://registry.npmjs.org/\nalways-auth=false\n')
    const compilerOptions = { target: 'ESNext', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: false, paths: {}, types: ['bun'], noEmit: true }
    receipt.compilerOptions = compilerOptions
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions, files: ['control.ts'] }))
    const installedTools = await run(['install'], consumer)
    expect(installedTools.code, installedTools.output).toBe(0)
    if (formatterArchive) await selectProducer(join(consumer, 'node_modules/pickier'))
    const compiler = join(consumer, 'node_modules/typescript/lib/tsc.js')
    const controls = [
      { text: `declare const value: Result; const count: number = value[0].listenerCount('message');
type IsAny<T> = 0 extends (1 & T) ? true : false;
const safeFirst: false = null as unknown as IsAny<Result[0]>;
const safeNamed: false = null as unknown as IsAny<Result[1]>;
const safeNamespace: false = null as unknown as IsAny<Result[2]>;
const safeInline: false = null as unknown as IsAny<Result[3]>;
const safeAfterUnused: false = null as unknown as IsAny<Result[4]>;` },
      { code: 2322, text: "declare const value: Result; const wrong: string = value[0].listenerCount('message')" },
      { code: 2339, text: 'declare const value: Result; const phantom = value[2].notAnEmitterMethod()' },
    ]
    if (formatterArchive) {
      controls.push(
        { code: 2345, text: "formatCode('x', defaultConfig, 42)" },
        { code: 2339, text: "formatImports('x').notAStringMethod()" },
      )
    }
    async function check(specifier: string) {
      for (const [index, control] of controls.entries()) {
        const api = formatterArchive ? `import { formatCode, formatImports, defaultConfig } from 'pickier'
type NotAny<T> = 0 extends (1 & T) ? true : false;
const safeAPI: false = null as unknown as NotAny<ReturnType<typeof formatCode>>;
const safeConfig: false = null as unknown as NotAny<typeof defaultConfig>;
const output: string = formatCode('const value = 1', defaultConfig, 'input.ts');
` : ''
        await writeFile(join(consumer, 'control.ts'), `${api}import type { Result } from '${specifier}'\n${control.text}\n`)
        const checked = await run([compiler, '--project', 'tsconfig.json'], consumer)
        expect(checked.code === 0, checked.output).toBe(index === 0)
        if ('code' in control) expect(checked.output.match(/error TS\d+/g), checked.output).toEqual([`error TS${control.code}`])
      }
    }
    await check('../library/index.js')
    const formatted = format(source, configuration, 'index.ts')
    expect(format(formatted, configuration, 'index.ts')).toBe(formatted)
    await writeFile(join(library, 'index.ts'), formatted)
    const formattedCLI = await run([cli, 'run', join(library, 'index.ts'), '--mode', 'format', '--write'], library)
    expect(formattedCLI.code, formattedCLI.output).toBe(0)
    expect(await readFile(join(library, 'index.ts'), 'utf8')).toBe(formatted)
    const archive = join(directory, 'formatted.tgz')
    const packed = await run(['pm', 'pack', '--filename', archive], library)
    expect(packed.code, packed.output).toBe(0)
    const bytes = new Uint8Array(await readFile(archive))
    receipt.archiveSHA256 = hash(bytes)
    const files = await new Bun.Archive(bytes).files()
    manifest.dependencies['type-import-fixture'] = `file:${archive}`
    await writeFile(join(consumer, 'package.json'), JSON.stringify(manifest))
    for (const frozen of [false, true]) {
      if (frozen) await rm(join(consumer, 'node_modules'), { recursive: true, force: true })
      const installed = await run(['install', ...(frozen ? ['--frozen-lockfile'] : [])], consumer)
      expect(installed.code, installed.output).toBe(0)
      const lock = hash(await readFile(join(consumer, 'bun.lock')))
      if (frozen) {
        if (typeof receipt.lockSHA256 !== 'string') throw new Error('Normal install must establish the lock hash')
        expect(lock).toBe(receipt.lockSHA256)
      }
      else receipt.lockSHA256 = lock
      for (const [name, file] of files) {
        expect(name.startsWith('package/') && !name.split('/').includes('..')).toBe(true)
        const installedFile = await readFile(join(consumer, 'node_modules/type-import-fixture', name.slice(8)))
        expect(hash(installedFile)).toBe(hash(new Uint8Array(await file.arrayBuffer())))
      }
      if (formatterFiles) {
        for (const [name, file] of formatterFiles) {
          expect(name.startsWith('package/') && !name.split('/').includes('..')).toBe(true)
          const installedFile = await readFile(join(consumer, 'node_modules/pickier', name.slice(8)))
          expect(hash(installedFile)).toBe(hash(new Uint8Array(await file.arrayBuffer())))
        }
      }
      expect(JSON.parse(await readFile(join(consumer, 'node_modules/typescript/package.json'), 'utf8')).version).toBe('7.0.2')
      await check('type-import-fixture')
      const runtime = await run(['-e', "const { sameEmitter } = await import('type-import-fixture'); if (sameEmitter !== true) throw new Error('Formatted runtime imports changed identity')"], consumer)
      expect(runtime.code, runtime.output).toBe(0)
    }
    receipt.completed = true
  }
  finally {
    await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2))
    await rm(join(consumer, 'node_modules'), { recursive: true, force: true })
    if (!process.env.PICKIER_IMPORT_EVIDENCE) await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
