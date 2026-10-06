/**
 * Combined Lint + Format Performance Benchmarks
 * Compares full workflow of linting and formatting
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import * as prettier from 'prettier'
import { defaultConfig, formatCode, runLintProgrammatic } from '../../packages/pickier/src/index'
import { pickierCli, pickierCliLabel } from './pickier-cli'
import { biomeCmd, biomeStyle, eslintCmd, nodeVersion, oxfmtCmd, oxlintCmd, verifyCli, version } from './tools'

// ESLint needs real Node — its ajv dependency does not run on Bun
if (!nodeVersion())
  throw new Error('ESLint needs Node on PATH (e.g. `pantry install -g node`)')

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

const prettierOpts = {
  parser: 'typescript' as const,
  semi: false,
  singleQuote: true,
  tabWidth: 2,
}

for (const [size, f] of Object.entries(fixtures)) {
  verifyCli('ESLint', `${eslintCmd} ${f}`)
  verifyCli('oxlint', `${oxlintCmd} ${f}`)
  verifyCli('oxfmt (stdin)', `${oxfmtCmd} --stdin-filepath=${f}`, fixtureContent[size as keyof typeof fixtureContent])
  verifyCli('Biome', `${biomeCmd} check ${biomeStyle} ${f}`)
  verifyCli('Pickier', `${pickierCli} run ${f} --mode lint`)
  verifyCli('Pickier', `${pickierCli} run ${f} --mode format --check`)
}

// Pickier: programmatic lint + in-memory format (fastest possible)
async function runPickierFull(filePath: string, content: string) {
  await runLintProgrammatic([filePath], { reporter: 'json' })
  formatCode(content, defaultConfig, filePath)
}

// ESLint (CLI) + Prettier (in-memory) — fair comparison: same API tier where available
async function runESLintPrettier(filePath: string, content: string) {
  try { execSync(`${eslintCmd} ${filePath}`, { stdio: 'ignore' }) }
catch { /* issues found */ }
  await prettier.format(content, prettierOpts)
}

// Pickier CLI: lint + format
function runPickierCli(filePath: string) {
  try { execSync(`${pickierCli} run ${filePath} --mode lint`, { stdio: 'ignore' }) }
catch { /* ok */ }
  try { execSync(`${pickierCli} run ${filePath} --mode format --check`, { stdio: 'ignore' }) }
catch { /* ok */ }
}

// Biome check (lint + format in one CLI command)
function runBiomeFull(filePath: string) {
  try { execSync(`${biomeCmd} check ${biomeStyle} ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

// oxlint (lint) + oxfmt (format via stdin) — two separate Rust tools
function runOxlintOxfmt(filePath: string, content: string) {
  try { execSync(`${oxlintCmd} ${filePath}`, { stdio: 'ignore' }) }
catch { /* issues found */ }
  try {
    execSync(`${oxfmtCmd} --stdin-filepath=${filePath}`, {
      input: content,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  }
  catch { /* non-zero exit expected */ }
}

console.log(`\n${'='.repeat(72)}`)
console.log('  PICKIER vs ESLint+Prettier vs oxlint+oxfmt vs Biome — Combined Lint+Format')
console.log(`${'='.repeat(72)}`)
console.log(`  ESLint:   ${version(eslintCmd)} on node ${nodeVersion()}`)
console.log(`  Biome:    ${version(biomeCmd)}`)
console.log(`  Prettier: format() in memory`)
console.log(`  oxlint:   ${version(oxlintCmd)}`)
console.log(`  oxfmt:    ${version(oxfmtCmd)} (stdin)`)
console.log(`  Pickier CLI: ${pickierCli}`)
console.log(`  Note: 'pickier (api)' = programmatic API; 'pickier (cli)' = ${pickierCli}`)
console.log(`${'='.repeat(72)}\n`)

for (const [label, size] of [['Small (~52 lines)', 'small'], ['Medium (~419 lines)', 'medium'], ['Large (~1279 lines)', 'large']] as const) {
  group(`Combined (Lint + Format) — ${label}`, () => {
    bench('pickier (api)', async () => {
      await runPickierFull(fixtures[size], fixtureContent[size])
    })

    bench(pickierCliLabel, () => {
      runPickierCli(fixtures[size])
    })

    bench('eslint + prettier', async () => {
      await runESLintPrettier(fixtures[size], fixtureContent[size])
    })

    bench('oxlint + oxfmt', () => {
      runOxlintOxfmt(fixtures[size], fixtureContent[size])
    })

    bench('biome', () => {
      runBiomeFull(fixtures[size])
    })
  })
}

group('Combined (Lint + Format) — All Files (batch)', () => {
  bench('pickier (api)', async () => {
    for (const [k, f] of Object.entries(fixtures))
      await runPickierFull(f, fixtureContent[k as keyof typeof fixtureContent])
  })

  bench(pickierCliLabel, () => {
    for (const f of Object.values(fixtures)) runPickierCli(f)
  })

  bench('eslint + prettier', async () => {
    for (const [k, f] of Object.entries(fixtures))
      await runESLintPrettier(f, fixtureContent[k as keyof typeof fixtureContent])
  })

  bench('oxlint + oxfmt', () => {
    for (const [k, f] of Object.entries(fixtures))
      runOxlintOxfmt(f, fixtureContent[k as keyof typeof fixtureContent])
  })

  bench('biome', () => {
    for (const f of Object.values(fixtures)) runBiomeFull(f)
  })
})

// Run benchmarks
await run({
  format: 'mitata',
  colors: true,
})
