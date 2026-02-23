/**
 * Main Benchmark Runner — Overview
 * Quick comparison across all tool categories.
 * For detailed suites run bench:lint, bench:format, bench:combined.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { defaultConfig, formatCode, runLintProgrammatic } from 'pickier'
import * as prettier from 'prettier'

function which(bin: string): string | null {
  try { return execSync(`which ${bin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

// ESLint must run via node — ajv dependency has a Bun compat issue
const eslintBin = resolve(__dirname, '../../node_modules/.bin/eslint')
const eslintCmd = `node ${eslintBin}`
const biomeGlobal = which('biome')
const biomeCmd = biomeGlobal ?? 'bunx @biomejs/biome'
const oxlintGlobal = which('oxlint')
const oxlintCmd = oxlintGlobal ?? 'bunx oxlint'
const pickierZigBin = resolve(__dirname, '../../packages/zig/zig-out/bin/pickier-zig')

try { execSync(`${eslintCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${biomeCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${oxlintCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }

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

const prettierOpts = { parser: 'typescript' as const, semi: false, singleQuote: true, tabWidth: 2 }
const cfg = { ...defaultConfig }

const mediumLines = fixtureContent.medium.split('\n').length
const largeLines = fixtureContent.large.split('\n').length

console.log('\n🚀 Pickier Benchmarks — Overview\n')
console.log('='.repeat(80))
console.log(`  Small:  ${fixtureContent.small.split('\n').length} lines`)
console.log(`  Medium: ${mediumLines} lines`)
console.log(`  Large:  ${largeLines} lines`)
console.log(`  Pickier Zig: ${pickierZigBin}`)
console.log(`  ESLint: ${eslintBin} (via node)`)
console.log('='.repeat(80) + '\n')

// ── Linting ──────────────────────────────────────────────────────────────────
group(`Linting — Medium File (${mediumLines} lines)`, () => {
  bench('Pickier (api)', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })
  bench('Pickier (cli)', () => {
    try { execSync(`${pickierZigBin} run ${fixtures.medium} --mode lint`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('ESLint (node)', () => {
    try { execSync(`${eslintCmd} ${fixtures.medium}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('Biome', () => {
    try { execSync(`${biomeCmd} lint ${fixtures.medium}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('oxlint', () => {
    try { execSync(`${oxlintCmd} ${fixtures.medium}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
})

group(`Linting — Large File (${largeLines} lines)`, () => {
  bench('Pickier (api)', async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
  })
  bench('Pickier (cli)', () => {
    try { execSync(`${pickierZigBin} run ${fixtures.large} --mode lint`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('ESLint (node)', () => {
    try { execSync(`${eslintCmd} ${fixtures.large}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('Biome', () => {
    try { execSync(`${biomeCmd} lint ${fixtures.large}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('oxlint', () => {
    try { execSync(`${oxlintCmd} ${fixtures.large}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
})

// ── Formatting ───────────────────────────────────────────────────────────────
group(`Formatting — Medium File (${mediumLines} lines)`, () => {
  bench('Pickier (api)', () => {
    formatCode(fixtureContent.medium, cfg, 'bench.ts')
  })
  bench('Pickier (cli)', () => {
    try { execSync(`${pickierZigBin} run ${fixtures.medium} --mode format --check`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('Prettier', async () => {
    await prettier.format(fixtureContent.medium, prettierOpts)
  })
  bench('Biome (stdin)', () => {
    try {
      execSync(`${biomeCmd} format --stdin-file-path=bench.ts --quote-style=single --semicolons=as-needed`, {
        input: fixtureContent.medium, stdio: ['pipe', 'ignore', 'ignore'],
      })
    }
    catch { /* ok */ }
  })
})

group(`Formatting — Large File (${largeLines} lines)`, () => {
  bench('Pickier (api)', () => {
    formatCode(fixtureContent.large, cfg, 'bench.ts')
  })
  bench('Pickier (cli)', () => {
    try { execSync(`${pickierZigBin} run ${fixtures.large} --mode format --check`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('Prettier', async () => {
    await prettier.format(fixtureContent.large, prettierOpts)
  })
  bench('Biome (stdin)', () => {
    try {
      execSync(`${biomeCmd} format --stdin-file-path=bench.ts --quote-style=single --semicolons=as-needed`, {
        input: fixtureContent.large, stdio: ['pipe', 'ignore', 'ignore'],
      })
    }
    catch { /* ok */ }
  })
})

// ── Stress test ───────────────────────────────────────────────────────────────
group('Stress Test — Lint 50x Small File', () => {
  bench('Pickier (api)', async () => {
    for (let i = 0; i < 50; i++)
      await runLintProgrammatic([fixtures.small], { reporter: 'json' })
  })
  bench('Pickier (cli)', () => {
    for (let i = 0; i < 50; i++)
      try { execSync(`${pickierZigBin} run ${fixtures.small} --mode lint`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('ESLint (node)', () => {
    for (let i = 0; i < 50; i++)
      try { execSync(`${eslintCmd} ${fixtures.small}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
  bench('Biome', () => {
    for (let i = 0; i < 50; i++)
      try { execSync(`${biomeCmd} lint ${fixtures.small}`, { stdio: 'ignore' }) } catch { /* ok */ }
  })
})

await run({ colors: true })

console.log(`\n${'='.repeat(80)}`)
console.log('For detailed suites:')
console.log('  bun run bench:lint              — linting only')
console.log('  bun run bench:format            — formatting only')
console.log('  bun run bench:format-comparison — full format comparison')
console.log('  bun run bench:combined          — combined lint+format')
console.log('='.repeat(80) + '\n')
