/**
 * Main Benchmark Runner — Overview
 * Quick comparison across all tool categories.
 * For detailed suites run bench:lint, bench:format, bench:combined.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { defaultConfig, formatCode, runLintProgrammatic } from '../../packages/pickier/src/index'
import * as prettier from 'prettier'
import { pickierCli, pickierCliLabel } from './pickier-cli'
import { biomeCmd, biomeStyle, eslintCmd, nodeVersion, oxlintCmd, verifyCli } from './tools'

// ESLint needs real Node — its ajv dependency does not run on Bun
if (!nodeVersion())
  throw new Error('ESLint needs Node on PATH (e.g. `pantry install -g node`)')

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

for (const [size, f] of Object.entries(fixtures)) {
  verifyCli('ESLint', `${eslintCmd} ${f}`)
  verifyCli('oxlint', `${oxlintCmd} ${f}`)
  verifyCli('Biome', `${biomeCmd} lint ${f}`)
  verifyCli('Biome (stdin)', `${biomeCmd} format --stdin-file-path=bench.ts ${biomeStyle}`, fixtureContent[size as keyof typeof fixtureContent])
  verifyCli('Pickier', `${pickierCli} run ${f} --mode lint`)
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
console.log(`  Pickier CLI: ${pickierCli}`)
console.log(`  ESLint: ${eslintCmd} (node ${nodeVersion()})`)
console.log('='.repeat(80) + '\n')

// ── Linting ──────────────────────────────────────────────────────────────────
group(`Linting — Medium File (${mediumLines} lines)`, () => {
  bench('Pickier (api)', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })
  bench(pickierCliLabel, () => {
    try { execSync(`${pickierCli} run ${fixtures.medium} --mode lint`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('ESLint (node)', () => {
    try { execSync(`${eslintCmd} ${fixtures.medium}`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('Biome', () => {
    try { execSync(`${biomeCmd} lint ${fixtures.medium}`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('oxlint', () => {
    try { execSync(`${oxlintCmd} ${fixtures.medium}`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
})

group(`Linting — Large File (${largeLines} lines)`, () => {
  bench('Pickier (api)', async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
  })
  bench(pickierCliLabel, () => {
    try { execSync(`${pickierCli} run ${fixtures.large} --mode lint`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('ESLint (node)', () => {
    try { execSync(`${eslintCmd} ${fixtures.large}`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('Biome', () => {
    try { execSync(`${biomeCmd} lint ${fixtures.large}`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('oxlint', () => {
    try { execSync(`${oxlintCmd} ${fixtures.large}`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
})

// ── Formatting ───────────────────────────────────────────────────────────────
group(`Formatting — Medium File (${mediumLines} lines)`, () => {
  bench('Pickier (api)', () => {
    formatCode(fixtureContent.medium, cfg, 'bench.ts')
  })
  bench(pickierCliLabel, () => {
    try { execSync(`${pickierCli} run ${fixtures.medium} --mode format --check`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('Prettier', async () => {
    await prettier.format(fixtureContent.medium, prettierOpts)
  })
  bench('Biome (stdin)', () => {
    try {
      execSync(`${biomeCmd} format --stdin-file-path=bench.ts ${biomeStyle}`, {
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
  bench(pickierCliLabel, () => {
    try { execSync(`${pickierCli} run ${fixtures.large} --mode format --check`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('Prettier', async () => {
    await prettier.format(fixtureContent.large, prettierOpts)
  })
  bench('Biome (stdin)', () => {
    try {
      execSync(`${biomeCmd} format --stdin-file-path=bench.ts ${biomeStyle}`, {
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
  bench(pickierCliLabel, () => {
    for (let i = 0; i < 50; i++)
      try { execSync(`${pickierCli} run ${fixtures.small} --mode lint`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('ESLint (node)', () => {
    for (let i = 0; i < 50; i++)
      try { execSync(`${eslintCmd} ${fixtures.small}`, { stdio: 'ignore' }) }
catch { /* ok */ }
  })
  bench('Biome', () => {
    for (let i = 0; i < 50; i++)
      try { execSync(`${biomeCmd} lint ${fixtures.small}`, { stdio: 'ignore' }) }
catch { /* ok */ }
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
