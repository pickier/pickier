/**
 * Pickier vs oxfmt vs Biome vs Prettier — Formatting Benchmark
 *
 * All tools compared in every group:
 *
 *   1. Programmatic / In-memory
 *      Pickier formatCode() — in-memory, no process spawn
 *      Prettier format()   — in-memory, no process spawn
 *      oxfmt               — piped via stdin (no JS API)
 *      Biome               — piped via stdin (no JS API)
 *
 *   2. CLI (single file)
 *      All tools spawn a subprocess.
 *      Pickier uses its Zig-compiled native binary for max speed.
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
import { defaultConfig, formatCode } from 'pickier'
import * as prettier from 'prettier'

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
// Resolve CLI binaries once, outside the hot loop
// ---------------------------------------------------------------------------
function which(bin: string): string | null {
  try {
    return execSync(`which ${bin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return null
  }
}

const oxfmtGlobal = which('oxfmt')
const oxfmtCmd = oxfmtGlobal ?? 'npx --yes oxfmt'
const biomeGlobal = which('biome')
const biomeCmd = biomeGlobal ?? 'npx --yes @biomejs/biome'
const prettierGlobal = which('prettier')
const prettierCmd = prettierGlobal ?? 'npx --yes prettier'
const pickierZigBin = resolve(__dirname, '../../packages/zig/zig-out/bin/pickier-zig')

// Warm up npx cache so the first bench iteration isn't penalised
try { execSync(`${oxfmtCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${biomeCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${prettierCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }

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

/** oxfmt via stdin — no JS API available */
function stdinOxfmt(src: string): void {
  try {
    execSync(`${oxfmtCmd} format --stdin-filepath bench.ts`, {
      input: src,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  }
  catch { /* non-zero exit expected */ }
}

/** Biome via stdin — no JS formatting API available */
function stdinBiome(src: string): void {
  try {
    execSync(`${biomeCmd} format --stdin-file-path=bench.ts --quote-style=single --semicolons=as-needed --indent-width=2`, {
      input: src,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  }
  catch { /* non-zero exit expected */ }
}

function cliOxfmt(filePath: string): void {
  try { execSync(`${oxfmtCmd} format --check ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

function cliBiome(filePath: string): void {
  try { execSync(`${biomeCmd} format --quote-style=single --semicolons=as-needed --indent-width=2 ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

function cliPrettier(filePath: string): void {
  try { execSync(`${prettierCmd} --check ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

function cliPickier(filePath: string): void {
  try {
    execSync(`${pickierZigBin} run ${filePath} --mode format --check`, {
      stdio: 'ignore',
    })
  }
  catch { /* non-zero exit expected */ }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(80)}`)
console.log('     PICKIER (Zig) vs OXFMT vs BIOME vs PRETTIER — Formatting Benchmark')
console.log('='.repeat(80))
console.log('\nFixtures:')
console.log(`  Small:  ${stats.small.lines} lines  (${(stats.small.bytes / 1024).toFixed(1)} KB)`)
console.log(`  Medium: ${stats.medium.lines} lines  (${(stats.medium.bytes / 1024).toFixed(1)} KB)`)
console.log(`  Large:  ${stats.large.lines} lines  (${(stats.large.bytes / 1024).toFixed(1)} KB)`)
console.log()
console.log('Tools:')
console.log(`  Pickier:   formatCode() in-memory  +  Zig-compiled native binary CLI`)
console.log(`  oxfmt:     ${oxfmtGlobal ?? '(via npx)'}  — stdin pipe + CLI  (no JS API)`)
console.log(`  Biome:     ${biomeGlobal ?? '(via npx)'}  — stdin pipe + CLI  (no JS formatting API)`)
console.log(`  Prettier:  format() in-memory  +  ${prettierGlobal ?? 'npx'} CLI`)
console.log(`${'='.repeat(80)}\n`)

// ===================================================================
// 1. Programmatic — Pickier & Prettier in-memory, oxfmt & Biome stdin
// ===================================================================

for (const [label, size] of [['Small', 'small'], ['Medium', 'medium'], ['Large', 'large']] as const) {
  group(`In-memory — ${label} File (${stats[size].lines} lines)`, () => {
    bench('Pickier', () => {
      formatCode(content[size], cfg, 'bench.ts')
    })

    bench('oxfmt (stdin)', () => {
      stdinOxfmt(content[size])
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
    bench('Pickier (Zig)', () => {
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
  bench('Pickier (Zig)', () => {
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

  bench('oxfmt (stdin)', () => {
    for (let i = 0; i < 20; i++) stdinOxfmt(content.large)
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
