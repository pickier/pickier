/**
 * Formatting Performance Benchmarks
 * Compares Pickier vs Prettier vs Biome vs oxfmt
 *
 * In memory: Pickier, Prettier and oxfmt through their JS APIs; Biome has no
 * JS formatting API, so it is piped through stdin.
 * CLI: every tool spawns a process and checks the file on disk.
 *
 * Run: bun run bench:format
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { format as oxfmtFormat } from 'oxfmt'
import * as prettier from 'prettier'
import { defaultConfig, formatCode } from '../../packages/pickier/src/index'
import { pickierCli, pickierCliLabel } from './pickier-cli'
import { biomeCmd, biomeStyle, oxfmtCmd, verifyCli } from './tools'

const fixtures = {
  small: resolve(__dirname, '../fixtures/small.ts'),
  medium: resolve(__dirname, '../fixtures/medium.ts'),
  large: resolve(__dirname, '../fixtures/large.ts'),
}

const content = {
  small: readFileSync(fixtures.small, 'utf-8'),
  medium: readFileSync(fixtures.medium, 'utf-8'),
  large: readFileSync(fixtures.large, 'utf-8'),
}

const prettierOpts = {
  parser: 'typescript' as const,
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  printWidth: 100,
}

const oxfmtOpts = { semi: false, singleQuote: true, tabWidth: 2, printWidth: 100 }

const cfg = { ...defaultConfig }

const stdinBiomeCmd = `${biomeCmd} format --stdin-file-path=bench.ts ${biomeStyle}`
const cliPickierCmd = (f: string) => `${pickierCli} run ${f} --mode format --check`
const cliBiomeCmd = (f: string) => `${biomeCmd} format ${biomeStyle} ${f}`
const cliOxfmtCmd = (f: string) => `${oxfmtCmd} --check ${f}`

for (const f of Object.values(fixtures)) {
  verifyCli('Pickier', cliPickierCmd(f))
  verifyCli('Biome', cliBiomeCmd(f))
  verifyCli('oxfmt', cliOxfmtCmd(f))
  verifyCli('Biome (stdin)', stdinBiomeCmd, readFileSync(f, 'utf-8'))
}

function stdinBiome(src: string): void {
  try { execSync(stdinBiomeCmd, { input: src, stdio: ['pipe', 'ignore', 'ignore'] }) }
  catch { /* non-zero exit expected */ }
}

function cli(cmd: string): void {
  try { execSync(cmd, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

console.log(`\n${'='.repeat(72)}`)
console.log('  PICKIER vs Prettier vs Biome vs oxfmt — Formatting Benchmark')
console.log(`${'='.repeat(72)}`)
console.log(`  Pickier CLI: ${pickierCli}`)
console.log(`  Biome:       ${biomeCmd}`)
console.log(`  oxfmt:       ${oxfmtCmd}`)
console.log(`${'='.repeat(72)}\n`)

// ── In-memory / programmatic ────────────────────────────────────────────────
for (const [label, size] of [['Small (~52 lines)', 'small'], ['Medium (~419 lines)', 'medium'], ['Large (~1279 lines)', 'large']] as const) {
  group(`In-memory — ${label}`, () => {
    bench('pickier', () => {
      formatCode(content[size], cfg, 'bench.ts')
    })

    bench('prettier', async () => {
      await prettier.format(content[size], prettierOpts)
    })

    bench('oxfmt', async () => {
      await oxfmtFormat('bench.ts', content[size], oxfmtOpts)
    })

    bench('biome (stdin)', () => {
      stdinBiome(content[size])
    })
  })
}

// ── CLI ─────────────────────────────────────────────────────────────────────
for (const [label, size] of [['Small (~52 lines)', 'small'], ['Medium (~419 lines)', 'medium'], ['Large (~1279 lines)', 'large']] as const) {
  group(`CLI — ${label}`, () => {
    bench(pickierCliLabel, () => cli(cliPickierCmd(fixtures[size])))
    bench('biome', () => cli(cliBiomeCmd(fixtures[size])))
    bench('oxfmt', () => cli(cliOxfmtCmd(fixtures[size])))
  })
}

// ── CLI Batch ────────────────────────────────────────────────────────────────
group('CLI Batch — All Files', () => {
  bench(pickierCliLabel, () => {
    for (const fp of Object.values(fixtures)) cli(cliPickierCmd(fp))
  })

  bench('biome', () => {
    for (const fp of Object.values(fixtures)) cli(cliBiomeCmd(fp))
  })

  bench('oxfmt', () => {
    for (const fp of Object.values(fixtures)) cli(cliOxfmtCmd(fp))
  })
})

// ── Throughput ───────────────────────────────────────────────────────────────
group('Throughput — Large File x 20', () => {
  bench('pickier', () => {
    for (let i = 0; i < 20; i++) formatCode(content.large, cfg, 'bench.ts')
  })

  bench('prettier', async () => {
    for (let i = 0; i < 20; i++) await prettier.format(content.large, prettierOpts)
  })

  bench('oxfmt', async () => {
    for (let i = 0; i < 20; i++) await oxfmtFormat('bench.ts', content.large, oxfmtOpts)
  })

  bench('biome (stdin)', () => {
    for (let i = 0; i < 20; i++) stdinBiome(content.large)
  })
})

await run({ colors: true })
