import { afterAll, describe, expect, it } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lintInWorkers } from '../../src/parallel'

/**
 * A CLI run over many files spreads them over worker threads (parallel.ts).
 * Whatever the thread count, the report and the files `--fix` writes must be
 * exactly what a single-threaded run produces.
 */
const CLI = resolve(__dirname, '../../bin/cli.ts')
const root = mkdtempSync(join(tmpdir(), 'pickier-parallel-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

// Enough files to cross the worker threshold, each with something to report or fix
const project = join(root, 'project')
mkdirSync(join(project, 'src'), { recursive: true })
for (let i = 0; i < 48; i++) {
  writeFileSync(join(project, 'src', `file-${i}.ts`), [
    `import { unused${i} } from './dep'`,
    `let count${i} = ${i}`,
    `export const value${i} = "double quoted"`,
    `export function read${i}() {`,
    `  debugger`,
    `  return count${i}`,
    `}`,
    '',
  ].join('\n'))
}

function run(dir: string, workers: string, ...args: string[]): { out: string, code: number } {
  const out = join(root, `${workers}-${args.join('')}.json`)
  // JSON to a file, not a pipe: the process can exit before a pipe drains
  const r = Bun.spawnSync(['sh', '-c', `bun ${CLI} run src --mode lint --reporter json ${args.join(' ')} > ${out}`], {
    cwd: dir,
    env: { ...process.env, PICKIER_WORKERS: workers },
  })
  return { out: readFileSync(out, 'utf8').replaceAll(dir, '<dir>'), code: r.exitCode }
}

function files(dir: string): Record<string, string> {
  const src = join(dir, 'src')
  return Object.fromEntries(readdirSync(src).sort().map(f => [f, readFileSync(join(src, f), 'utf8')]))
}

describe('linting on worker threads', () => {
  it('reports exactly what one thread reports', () => {
    const single = run(project, '0')
    const threaded = run(project, '3')
    expect(JSON.parse(single.out).issues.length).toBeGreaterThan(48)
    expect(threaded.out).toBe(single.out)
    expect(threaded.code).toBe(single.code)
  })

  it('fixes files exactly as one thread does', () => {
    const a = join(root, 'fix-single')
    const b = join(root, 'fix-threaded')
    cpSync(project, a, { recursive: true })
    cpSync(project, b, { recursive: true })
    const single = run(a, '0', '--fix')
    const threaded = run(b, '3', '--fix')
    expect(threaded.out.replaceAll('fix-threaded', 'fix-single')).toBe(single.out)
    expect(files(b)).toEqual(files(a))
    expect(files(a)).not.toEqual(files(project))
  })
})

describe('workers that fail', () => {
  // Whatever goes wrong in a worker, its files are linted on the main thread
  // instead and the run neither hangs nor loses a file.
  const files = Array.from({ length: 40 }, (_, i) => `file-${i}.ts`)
  const lintHere = async (file: string) => [{ filePath: file, line: 1, column: 1, ruleId: 'here', message: '', severity: 'warning' as const }]
  const broken: Record<string, string> = {
    'throws on import': 'throw new Error(\'boom\')\n',
    'throws in its handler': 'self.onmessage = () => { throw new Error(\'boom\') }\n',
    'exits without a word': 'self.onmessage = () => { process.exit(3) }\n',
  }
  for (const [what, source] of Object.entries(broken)) {
    it(`falls back when a worker ${what}`, async () => {
      const entry = join(root, `${what.replaceAll(' ', '-')}.ts`)
      writeFileSync(entry, source)
      const results = await lintInWorkers(files, {} as any, 3, lintHere, pathToFileURL(entry).href)
      expect(results.map(r => r[0]!.filePath)).toEqual(files)
    })
  }
})

describe('workers a run is done with', () => {
  // Tearing a worker down mid-run - terminating it, or having it exit itself -
  // segfaults Bun while its siblings are still going (#1379). A worker that is
  // out of files is parked for the next run instead.
  const files = Array.from({ length: 40 }, (_, i) => `file-${i}.ts`)
  const lintHere = async (file: string) => [{ filePath: file, line: 1, column: 1, ruleId: 'here', message: '', severity: 'warning' as const }]

  it('are never terminated, and are taken up by the next run', async () => {
    // Every thread this entry starts leaves a line behind
    const log = join(root, 'spawns.log')
    const entry = join(root, 'parked-worker.ts')
    writeFileSync(entry, [
      'import { appendFileSync } from \'node:fs\'',
      `appendFileSync(${JSON.stringify(log)}, 'spawn\\n')`,
      'declare const self: Worker',
      'self.onmessage = (event: MessageEvent) => {',
      '  const message = event.data',
      '  if (message.type === \'init\')',
      '    return',
      '  const results = (message.batch as Array<[number, string]>).map(([index, file]) => [index, [{ filePath: file, line: 1, column: 1, ruleId: \'worker\', message: \'\', severity: \'warning\' }]])',
      '  postMessage({ type: \'done\', results })',
      '}',
      '',
    ].join('\n'))
    const href = pathToFileURL(entry).href
    const spawns = (): number => readFileSync(log, 'utf8').trim().split('\n').length

    const terminate = Worker.prototype.terminate
    let terminated = 0
    Worker.prototype.terminate = function (this: Worker) {
      terminated++
      return terminate.call(this)
    }
    try {
      const first = await lintInWorkers(files, {} as any, 3, lintHere, href)
      const spawned = spawns()
      const second = await lintInWorkers(files, {} as any, 1, lintHere, href)
      // Every file was linted on a worker, in both runs
      expect(first.map(r => r[0]!.ruleId)).toEqual(files.map(() => 'worker'))
      expect(second.map(r => r[0]!.ruleId)).toEqual(files.map(() => 'worker'))
      expect(terminated).toBe(0)
      // The second run picked a worker the first one parked
      expect(spawns()).toBe(spawned)
    }
    finally {
      Worker.prototype.terminate = terminate
    }
  })
})
