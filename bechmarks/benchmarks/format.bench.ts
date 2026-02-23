/**
 * Formatting Performance Benchmarks
 * Compares Pickier vs Prettier vs Biome vs oxfmt
 *
 * Pickier: formatCode() in-memory API + Zig native binary CLI
 * Others:  in-memory where available, CLI (stdin/file) otherwise
 *
 * Run: bun run bench:format
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { defaultConfig, formatCode } from 'pickier'
import * as prettier from 'prettier'

function which(bin: string): string | null {
  try { return execSync(`which ${bin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

const biomeGlobal = which('biome')
const biomeCmd = biomeGlobal ?? 'bunx @biomejs/biome'
const oxfmtGlobal = which('oxfmt')
const oxfmtCmd = oxfmtGlobal ?? 'bunx oxfmt'
const pickierZigBin = resolve(__dirname, '../../packages/zig/zig-out/bin/pickier-zig')

try { execSync(`${biomeCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${oxfmtCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }

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

const cfg = { ...defaultConfig }

function stdinBiome(src: string): void {
  try {
    execSync(`${biomeCmd} format --stdin-file-path=bench.ts --quote-style=single --semicolons=as-needed --indent-width=2`, {
      input: src,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  }
  catch { /* non-zero exit expected */ }
}

function stdinOxfmt(src: string): void {
  try {
    execSync(`${oxfmtCmd} format --stdin-filepath bench.ts`, {
      input: src,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  }
  catch { /* non-zero exit expected */ }
}

function cliPickier(filePath: string): void {
  try { execSync(`${pickierZigBin} run ${filePath} --mode format --check`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

function cliBiome(filePath: string): void {
  try { execSync(`${biomeCmd} format --quote-style=single --semicolons=as-needed --indent-width=2 ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

function cliOxfmt(filePath: string): void {
  try { execSync(`${oxfmtCmd} format --check ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

console.log(`\n${'='.repeat(72)}`)
console.log('  PICKIER vs Prettier vs Biome vs oxfmt — Formatting Benchmark')
console.log(`${'='.repeat(72)}`)
console.log(`  Pickier Zig: ${pickierZigBin}`)
console.log(`  Biome:       ${biomeGlobal ?? '(via bunx)'}`)
console.log(`  oxfmt:       ${oxfmtGlobal ?? '(via bunx)'}`)
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

    bench('biome (stdin)', () => {
      stdinBiome(content[size])
    })

    bench('oxfmt (stdin)', () => {
      stdinOxfmt(content[size])
    })
  })
}

// ── CLI ─────────────────────────────────────────────────────────────────────
for (const [label, size] of [['Small (~52 lines)', 'small'], ['Medium (~419 lines)', 'medium'], ['Large (~1279 lines)', 'large']] as const) {
  group(`CLI — ${label}`, () => {
    bench('pickier (cli)', () => {
      cliPickier(fixtures[size])
    })

    bench('biome', () => {
      cliBiome(fixtures[size])
    })

    bench('oxfmt', () => {
      cliOxfmt(fixtures[size])
    })
  })
}

// ── CLI Batch ────────────────────────────────────────────────────────────────
group('CLI Batch — All Files', () => {
  bench('pickier (cli)', () => {
    for (const fp of Object.values(fixtures)) cliPickier(fp)
  })

  bench('biome', () => {
    for (const fp of Object.values(fixtures)) cliBiome(fp)
  })

  bench('oxfmt', () => {
    for (const fp of Object.values(fixtures)) cliOxfmt(fp)
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

  bench('biome (stdin)', () => {
    for (let i = 0; i < 20; i++) stdinBiome(content.large)
  })

  bench('oxfmt (stdin)', () => {
    for (let i = 0; i < 20; i++) stdinOxfmt(content.large)
  })
})

await run({ colors: true })
