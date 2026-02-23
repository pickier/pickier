/**
 * Linting Performance Benchmarks
 * Compares pickier vs ESLint vs oxlint vs Biome
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { runLintProgrammatic } from 'pickier'

function which(bin: string): string | null {
  try { return execSync(`which ${bin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

// ESLint must run via node (not bun) — ESLint's ajv dependency has a Bun compat issue
const eslintBin = resolve(__dirname, '../../node_modules/.bin/eslint')
const eslintCmd = `node ${eslintBin}`
const oxlintGlobal = which('oxlint')
const oxlintCmd = oxlintGlobal ?? 'bunx oxlint'
const biomeGlobal = which('biome')
const biomeCmd = biomeGlobal ?? 'bunx @biomejs/biome'
// Pickier Zig native binary — same one used in format-comparison bench
const pickierBin = resolve(__dirname, '../../packages/zig/zig-out/bin/pickier-zig')

try { execSync(`${eslintCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${oxlintCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${biomeCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }

// Load fixtures
const fixtures = {
  small: resolve(__dirname, '../fixtures/small.ts'),
  medium: resolve(__dirname, '../fixtures/medium.ts'),
  large: resolve(__dirname, '../fixtures/large.ts'),
}

const fixtureContent = {
  small: readFileSync(fixtures.small, 'utf-8'),
  medium: readFileSync(fixtures.medium, 'utf-8'),
  large: readFileSync(fixtures.large, 'utf-8'),
}

function cliESLint(filePath: string): void {
  try { execSync(`${eslintCmd} ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected when issues found */ }
}

function cliOxlint(filePath: string): void {
  try { execSync(`${oxlintCmd} ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected when issues found */ }
}

function cliBiome(filePath: string): void {
  try { execSync(`${biomeCmd} lint ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected when issues found */ }
}

function cliPickier(filePath: string): void {
  try { execSync(`${pickierBin} run ${filePath} --mode lint`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected when issues found */ }
}

async function runPickier(filePath: string) {
  try {
    return await runLintProgrammatic([filePath], { reporter: 'json' })
  }
  catch {
    return { errors: 0, warnings: 0, issues: [] }
  }
}

console.log(`\n${'='.repeat(72)}`)
console.log('  PICKIER vs ESLint vs oxlint vs Biome — Linting Benchmark')
console.log(`${'='.repeat(72)}`)
console.log(`  ESLint:  ${eslintBin} (via node — Bun has ajv compat issue)`)
console.log(`  oxlint:  ${oxlintGlobal ?? '(via bunx)'}`)
console.log(`  Biome:   ${biomeGlobal ?? '(via bunx)'}`)
console.log(`  Pickier CLI: ${pickierBin}`)
console.log(`  Note: 'pickier (api)' = programmatic in-process; 'pickier (cli)' = native Zig binary spawn`)
console.log(`${'='.repeat(72)}\n`)

for (const [label, size] of [['Small (~52 lines)', 'small'], ['Medium (~419 lines)', 'medium'], ['Large (~1279 lines)', 'large']] as const) {
  group(`Linting — ${label}`, () => {
    bench('pickier (api)', async () => {
      await runPickier(fixtures[size])
    })

    bench('pickier (cli)', () => {
      cliPickier(fixtures[size])
    })

    bench('eslint (cli)', () => {
      cliESLint(fixtures[size])
    })

    bench('oxlint (cli)', () => {
      cliOxlint(fixtures[size])
    })

    bench('biome (cli)', () => {
      cliBiome(fixtures[size])
    })
  })
}

group('Linting — All Files (batch)', () => {
  bench('pickier (api)', async () => {
    await runLintProgrammatic(Object.values(fixtures), { reporter: 'json' })
  })

  bench('pickier (cli)', () => {
    for (const f of Object.values(fixtures)) cliPickier(f)
  })

  bench('eslint (cli)', () => {
    for (const f of Object.values(fixtures)) cliESLint(f)
  })

  bench('oxlint (cli)', () => {
    for (const f of Object.values(fixtures)) cliOxlint(f)
  })

  bench('biome (cli)', () => {
    for (const f of Object.values(fixtures)) cliBiome(f)
  })
})

// Run benchmarks
await run({
  format: 'mitata',
  colors: true,
})
