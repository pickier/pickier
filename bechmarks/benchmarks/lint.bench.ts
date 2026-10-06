/**
 * Linting Performance Benchmarks
 * Compares pickier vs ESLint vs oxlint vs Biome
 *
 * Each tool runs its default or recommended rule set: Pickier's defaults,
 * ESLint with @eslint/js + typescript-eslint recommended (eslint.config.js),
 * oxlint's defaults and Biome's recommended rules. They are not the same
 * rules, so this measures what each tool costs as people set it up.
 */
import { execSync, spawnSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { runLintProgrammatic } from '../../packages/pickier/src/index'
import { pickierCli } from './pickier-cli'
import { biomeCmd, eslintCmd, nodeVersion, oxlintCmd, verifyCli, version } from './tools'

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

for (const f of Object.values(fixtures)) {
  verifyCli('ESLint', `${eslintCmd} ${f}`)
  verifyCli('oxlint', `${oxlintCmd} ${f}`)
  verifyCli('Biome', `${biomeCmd} lint ${f}`)
  verifyCli('Pickier', `${pickierCli} run ${f} --mode lint`)
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
  try { execSync(`${pickierCli} run ${filePath} --mode lint`, { stdio: 'ignore' }) }
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
console.log(`  ESLint:  ${version(eslintCmd)} on node ${nodeVersion()}`)
console.log(`  oxlint:  ${version(oxlintCmd)}`)
console.log(`  Biome:   ${version(biomeCmd)}`)
console.log(`  Pickier CLI: ${pickierCli}`)
console.log(`  Note: 'pickier (api)' = programmatic in-process; 'pickier (cli)' = ${pickierCli}`)
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

// A whole project in one invocation per tool: a fresh copy of this
// repository's own packages/pickier/src, so every tool lints the same files
// and ESLint finds eslint.config.js above them (it ignores files outside the
// directory its config lives in). Not under .cache: Pickier's default ignores
// and oxlint's .gitignore handling both skip that, and a tool that lints
// nothing is timed as instant. Removed again when the run ends.
const projectDir = resolve(__dirname, '../project-src')
rmSync(projectDir, { recursive: true, force: true })
cpSync(resolve(__dirname, '../../packages/pickier/src'), projectDir, { recursive: true })
process.on('exit', () => rmSync(projectDir, { recursive: true, force: true }))
const projectFiles = Array.from(new Bun.Glob('**/*.ts').scanSync({ cwd: projectDir })).length

// Every tool must actually lint every file - one that skips them (an ignore
// rule, a missing config) would look fast. Each reports how many it read.
function output(cmd: string, stdoutOnly = false): string {
  const r = spawnSync('sh', ['-c', cmd], { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 })
  return stdoutOnly ? r.stdout : `${r.stdout}${r.stderr}`
}
const seen = {
  pickier: Number(/Scanned (\d+) files/.exec(output(`${pickierCli} run ${projectDir} --mode lint --verbose`))?.[1]),
  eslint: (JSON.parse(output(`${eslintCmd} ${projectDir} --format json`, true)) as unknown[]).length,
  oxlint: (JSON.parse(output(`${oxlintCmd} ${projectDir} -f json`, true)) as { number_of_files: number }).number_of_files,
  biome: Number(/Checked (\d+) files?/.exec(output(`${biomeCmd} lint ${projectDir}`))?.[1]),
}
for (const [tool, count] of Object.entries(seen)) {
  if (count !== projectFiles)
    throw new Error(`${tool} linted ${count} of the ${projectFiles} project files`)
}
const projectCmds = {
  pickier: `${pickierCli} run ${projectDir} --mode lint`,
  eslint: `${eslintCmd} ${projectDir}`,
  oxlint: `${oxlintCmd} ${projectDir}`,
  biome: `${biomeCmd} lint ${projectDir}`,
}
for (const [name, cmd] of Object.entries(projectCmds))
  verifyCli(name, cmd)
const cliRun = (cmd: string) => {
  try { execSync(cmd, { stdio: 'ignore' }) }
  catch { /* findings exit non-zero */ }
}

group(`Linting — project (packages/pickier/src, ${projectFiles} files, one invocation)`, () => {
  bench('pickier (cli)', () => cliRun(projectCmds.pickier))
  bench('eslint (cli)', () => cliRun(projectCmds.eslint))
  bench('oxlint (cli)', () => cliRun(projectCmds.oxlint))
  bench('biome (cli)', () => cliRun(projectCmds.biome))
})

// Run benchmarks
await run({
  format: 'mitata',
  colors: true,
})
