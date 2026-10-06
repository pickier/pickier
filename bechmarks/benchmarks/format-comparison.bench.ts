/**
 * Pickier vs oxfmt vs Biome vs Prettier — Formatting Benchmark
 *
 * All tools compared in every group:
 *
 *   1. Programmatic / In-memory
 *      Pickier formatCode() — in-memory, no process spawn
 *      oxfmt format()      — in-memory napi binding, no process spawn
 *      Prettier format()   — in-memory, no process spawn
 *      Biome               — piped via stdin (no JS formatting API)
 *
 *   2. CLI (single file)
 *      All tools spawn a subprocess.
 *      Pickier uses its Zig binary when built (packages/zig), else the npm CLI.
 *
 *   3. CLI Batch (all fixtures sequentially)
 *
 *   4. Throughput — 20 iterations of the large file
 *
 * Run: bun run bench:format-comparison
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { format as oxfmtFormat } from 'oxfmt'
import { defaultConfig, formatCode } from '../../packages/pickier/src/index'
import * as prettier from 'prettier'
import { pickierCli, pickierCliLabel } from './pickier-cli'
import { biomeCmd, biomeStyle, oxfmtCmd, prettierCmd, verifyCli } from './tools'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const fixturePaths = {
  small: resolve(__dirname, '../fixtures/small.ts'),
  medium: resolve(__dirname, '../fixtures/medium.ts'),
  large: resolve(__dirname, '../fixtures/large.ts'),
}

const content = {
  small: readFileSync(fixturePaths.small, 'utf-8'),
  medium: readFileSync(fixturePaths.medium, 'utf-8'),
  large: readFileSync(fixturePaths.large, 'utf-8'),
}

const stats = Object.fromEntries(
  Object.entries(content).map(([k, v]) => [k, {
    lines: v.split('\n').length,
    bytes: Buffer.byteLength(v, 'utf8'),
  }]),
) as Record<keyof typeof content, { lines: number, bytes: number }>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const cfg = { ...defaultConfig }

const prettierOpts = {
  parser: 'typescript' as const,
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  printWidth: 100,
}

const oxfmtOpts = {
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  printWidth: 100,
}

const stdinBiomeCmd = `${biomeCmd} format --stdin-file-path=bench.ts ${biomeStyle}`
const oxfmtCheck = (f: string) => `${oxfmtCmd} --check ${f}`
const biomeCheck = (f: string) => `${biomeCmd} format ${biomeStyle} ${f}`
const prettierCheck = (f: string) => `${prettierCmd} --check ${f}`
const pickierCheck = (f: string) => `${pickierCli} run ${f} --mode format --check`

// Every call below swallows the non-zero exit check mode returns, which
// would also hide a tool failing outright. Run each one for real first.
for (const [size, f] of Object.entries(fixturePaths)) {
  verifyCli('oxfmt', oxfmtCheck(f))
  verifyCli('Biome', biomeCheck(f))
  verifyCli('Prettier', prettierCheck(f))
  verifyCli('Pickier', pickierCheck(f))
  verifyCli('Biome (stdin)', stdinBiomeCmd, content[size as keyof typeof content])
}

/** Biome via stdin — no JS formatting API available */
function stdinBiome(src: string): void {
  try { execSync(stdinBiomeCmd, { input: src, stdio: ['pipe', 'ignore', 'ignore'] }) }
  catch { /* non-zero exit expected */ }
}

function cli(cmd: string): void {
  try { execSync(cmd, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

const cliOxfmt = (f: string) => cli(oxfmtCheck(f))
const cliBiome = (f: string) => cli(biomeCheck(f))
const cliPrettier = (f: string) => cli(prettierCheck(f))
const cliPickier = (f: string) => cli(pickierCheck(f))

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(80)}`)
console.log('     PICKIER vs OXFMT vs BIOME vs PRETTIER — Formatting Benchmark')
console.log('='.repeat(80))
console.log('\nFixtures:')
console.log(`  Small:  ${stats.small.lines} lines  (${(stats.small.bytes / 1024).toFixed(1)} KB)`)
console.log(`  Medium: ${stats.medium.lines} lines  (${(stats.medium.bytes / 1024).toFixed(1)} KB)`)
console.log(`  Large:  ${stats.large.lines} lines  (${(stats.large.bytes / 1024).toFixed(1)} KB)`)
console.log()
console.log('Tools:')
console.log(`  Pickier:   formatCode() in-memory  +  ${pickierCli} CLI`)
console.log(`  oxfmt:     format() in-memory  +  ${oxfmtCmd} CLI`)
console.log(`  Biome:     ${biomeCmd}  — stdin pipe + CLI  (no JS formatting API)`)
console.log(`  Prettier:  format() in-memory  +  ${prettierCmd} CLI`)
console.log(`${'='.repeat(80)}\n`)

// ===================================================================
// 1. Programmatic — Pickier, oxfmt & Prettier in-memory, Biome stdin
// ===================================================================

for (const [label, size] of [['Small', 'small'], ['Medium', 'medium'], ['Large', 'large']] as const) {
  group(`In-memory — ${label} File (${stats[size].lines} lines)`, () => {
    bench('Pickier', () => {
      formatCode(content[size], cfg, 'bench.ts')
    })

    bench('oxfmt', async () => {
      await oxfmtFormat('bench.ts', content[size], oxfmtOpts)
    })

    bench('Biome (stdin)', () => {
      stdinBiome(content[size])
    })

    bench('Prettier', async () => {
      await prettier.format(content[size], prettierOpts)
    })
  })
}

// ===================================================================
// 2. CLI — every tool spawns a process and reads the file
// ===================================================================

for (const [label, size] of [['Small', 'small'], ['Medium', 'medium'], ['Large', 'large']] as const) {
  group(`CLI — ${label} File (${stats[size].lines} lines)`, () => {
    bench(pickierCliLabel, () => {
      cliPickier(fixturePaths[size])
    })

    bench('oxfmt', () => {
      cliOxfmt(fixturePaths[size])
    })

    bench('Biome', () => {
      cliBiome(fixturePaths[size])
    })

    bench('Prettier', () => {
      cliPrettier(fixturePaths[size])
    })
  })
}

// ===================================================================
// 3. CLI Batch — format all three fixtures sequentially
// ===================================================================

group('CLI Batch — All Files', () => {
  bench(pickierCliLabel, () => {
    for (const fp of Object.values(fixturePaths)) cliPickier(fp)
  })

  bench('oxfmt', () => {
    for (const fp of Object.values(fixturePaths)) cliOxfmt(fp)
  })

  bench('Biome', () => {
    for (const fp of Object.values(fixturePaths)) cliBiome(fp)
  })

  bench('Prettier', () => {
    for (const fp of Object.values(fixturePaths)) cliPrettier(fp)
  })
})

// ===================================================================
// 4. Throughput — 20 iterations of the large file
// ===================================================================

group('Throughput — Large File x 20', () => {
  bench('Pickier', () => {
    for (let i = 0; i < 20; i++) formatCode(content.large, cfg, 'bench.ts')
  })

  bench('oxfmt', async () => {
    for (let i = 0; i < 20; i++) await oxfmtFormat('bench.ts', content.large, oxfmtOpts)
  })

  bench('Biome (stdin)', () => {
    for (let i = 0; i < 20; i++) stdinBiome(content.large)
  })

  bench('Prettier', async () => {
    for (let i = 0; i < 20; i++) await prettier.format(content.large, prettierOpts)
  })
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
await run({ colors: true })

console.log(`\n${'='.repeat(80)}`)
console.log('Done.')
console.log(`${'='.repeat(80)}\n`)
