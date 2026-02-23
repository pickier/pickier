/**
 * Combined Lint + Format Performance Benchmarks
 * Compares full workflow of linting and formatting
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { runLintProgrammatic } from 'pickier'
import * as prettier from 'prettier'

function which(bin: string): string | null {
  try { return execSync(`which ${bin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

// ESLint must run via node (not bun) — ESLint's ajv dependency has a Bun compat issue
const eslintBin = resolve(__dirname, '../../node_modules/.bin/eslint')
const eslintCmd = `node ${eslintBin}`
const biomeGlobal = which('biome')
const biomeCmd = biomeGlobal ?? 'bunx @biomejs/biome'
const prettierGlobal = which('prettier')
const prettierCmd = prettierGlobal ?? 'bunx prettier'
const oxlintGlobal = which('oxlint')
const oxlintCmd = oxlintGlobal ?? 'bunx oxlint'
const oxfmtGlobal = which('oxfmt')
const oxfmtCmd = oxfmtGlobal ?? 'bunx oxfmt'
const pickierZigBin = resolve(__dirname, '../../packages/zig/zig-out/bin/pickier-zig')

try { execSync(`${eslintCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${biomeCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${prettierCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${oxlintCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }
try { execSync(`${oxfmtCmd} --version`, { stdio: 'ignore' }) } catch { /* ignore */ }

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

// Pickier: programmatic lint + in-memory format (fastest possible)
async function runPickierFull(filePath: string, content: string) {
  const { formatCode, defaultConfig } = await import('pickier')
  await runLintProgrammatic([filePath], { reporter: 'json' })
  formatCode(content, defaultConfig, filePath)
}

// ESLint (CLI) + Prettier (in-memory) — fair comparison: same API tier where available
async function runESLintPrettier(filePath: string, content: string) {
  try { execSync(`${eslintCmd} ${filePath}`, { stdio: 'ignore' }) } catch { /* issues found */ }
  await prettier.format(content, prettierOpts)
}

// Pickier Zig: lint + format in one native binary invocation
function runPickierZig(filePath: string) {
  try { execSync(`${pickierZigBin} run ${filePath} --mode lint`, { stdio: 'ignore' }) } catch { /* ok */ }
  try { execSync(`${pickierZigBin} run ${filePath} --mode format --check`, { stdio: 'ignore' }) } catch { /* ok */ }
}

// Biome check (lint + format in one CLI command)
function runBiomeFull(filePath: string) {
  try { execSync(`${biomeCmd} check --quote-style=single --semicolons=as-needed ${filePath}`, { stdio: 'ignore' }) }
  catch { /* non-zero exit expected */ }
}

// oxlint (lint) + oxfmt (format via stdin) — two separate Rust tools
function runOxlintOxfmt(filePath: string, content: string) {
  try { execSync(`${oxlintCmd} ${filePath}`, { stdio: 'ignore' }) } catch { /* issues found */ }
  try {
    execSync(`${oxfmtCmd} format --stdin-filepath ${filePath}`, {
      input: content,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  }
  catch { /* non-zero exit expected */ }
}

console.log(`\n${'='.repeat(72)}`)
console.log('  PICKIER vs ESLint+Prettier vs oxlint+oxfmt vs Biome — Combined Lint+Format')
console.log(`${'='.repeat(72)}`)
console.log(`  ESLint:   ${eslintBin} (via node — Bun has ajv compat issue)`)
console.log(`  Biome:    ${biomeGlobal ?? '(via bunx)'}`)
console.log(`  Prettier: ${prettierGlobal ?? '(via bunx)'}`)
console.log(`  oxlint:   ${oxlintGlobal ?? '(via bunx)'}`)
console.log(`  oxfmt:    ${oxfmtGlobal ?? '(via bunx)'}`)
console.log(`  Pickier Zig: ${pickierZigBin}`)
console.log(`  Note: 'pickier (api)' = programmatic API; 'pickier (cli)' = native Zig binary CLI`)
console.log(`${'='.repeat(72)}\n`)

for (const [label, size] of [['Small (~52 lines)', 'small'], ['Medium (~419 lines)', 'medium'], ['Large (~1279 lines)', 'large']] as const) {
  group(`Combined (Lint + Format) — ${label}`, () => {
    bench('pickier (api)', async () => {
      await runPickierFull(fixtures[size], fixtureContent[size])
    })

    bench('pickier (cli)', () => {
      runPickierZig(fixtures[size])
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

  bench('pickier (cli)', () => {
    for (const f of Object.values(fixtures)) runPickierZig(f)
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
