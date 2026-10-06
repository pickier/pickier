/**
 * Markdown formatting on a real repository — Pickier vs oxfmt vs Prettier
 *
 * The corpus is mdn/content (~14.7k Markdown files, ~58 MB), pinned to one
 * commit so runs are comparable over time. It is shallow-cloned into
 * `.cache/mdn-content` on first run (~200 MB on disk).
 *
 * Every tool runs as a CLI in check mode over the same glob, from the corpus
 * root, so each one reads the same files from disk and writes nothing:
 *
 *   Pickier            pickier run 'files/**\/*.md' --mode format --check  (npm build)
 *   oxfmt              oxfmt --check 'files/**\/*.md'          (all cores)
 *   oxfmt (1 thread)   oxfmt --check --threads=1 'files/**\/*.md'
 *   Prettier           prettier --check 'files/**\/*.md'
 *
 * Check mode exits non-zero when a file would change, so exit code 1 is
 * expected; anything else means the tool failed and the run is aborted
 * rather than timed.
 *
 * Timing uses hyperfine when it is installed (warmup + repeated runs, mean ±
 * σ) and a built-in loop with the same statistics otherwise.
 *
 * Run: bun run bench:markdown-corpus
 *      MD_BENCH_RUNS=20 bun run bench:markdown-corpus
 *      MD_BENCH_SKIP_PRETTIER=1 bun run bench:markdown-corpus
 */
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import { pickierCli } from './pickier-cli'

const MDN_REPO = 'https://github.com/mdn/content.git'
const MDN_COMMIT = '5fd3b03e9ad1ee4e8bc64d4f6888570690a7fbc8'
const GLOB = 'files/**/*.md'

const root = resolve(__dirname, '..')
const corpus = resolve(root, '.cache/mdn-content')
const resultsDir = resolve(root, 'results')
const runs = Number(process.env.MD_BENCH_RUNS || 10)
// Prettier takes over a minute per run on this corpus; fewer runs keep the
// suite usable without changing its mean meaningfully.
const prettierRuns = Number(process.env.MD_BENCH_PRETTIER_RUNS || 3)
const skipPrettier = process.env.MD_BENCH_SKIP_PRETTIER === '1'

function which(bin: string): string | null {
  try {
    return execSync(`command -v ${bin}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  }
  catch {
    return null
  }
}

function sh(cmd: string, cwd = root): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------
if (!existsSync(resolve(corpus, '.git'))) {
  console.log(`Fetching mdn/content@${MDN_COMMIT.slice(0, 12)} (shallow, ~200 MB)…`)
  mkdirSync(corpus, { recursive: true })
  sh('git init -q', corpus)
  sh(`git remote add origin ${MDN_REPO}`, corpus)
  execSync(`git fetch -q --depth 1 origin ${MDN_COMMIT}`, { cwd: corpus, stdio: 'inherit' })
  sh('git checkout -q FETCH_HEAD', corpus)
}
const head = sh('git rev-parse HEAD', corpus)
if (head !== MDN_COMMIT)
  console.warn(`warning: corpus is at ${head.slice(0, 12)}, expected ${MDN_COMMIT.slice(0, 12)} — numbers will not match the published table`)
if (sh('git status --porcelain', corpus) !== '')
  throw new Error(`${corpus} has local changes; a formatter was run in write mode. Reset it with: git -C ${corpus} checkout .`)

const mdFiles = Array.from(new Bun.Glob(GLOB).scanSync({ cwd: corpus }))
const mdBytes = mdFiles.reduce((n, f) => n + Bun.file(resolve(corpus, f)).size, 0)

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
// Prettier and the oxfmt wrapper are Node CLIs; use Node when it is there,
// which is how most people run them, and Bun otherwise. `bun run` puts a
// `node` shim on PATH that is Bun itself, so ask the runtime what it is.
function realNodeVersion(): string | null {
  try {
    return sh(`node -e "if (typeof Bun === 'undefined') process.stdout.write(process.version)"`) || null
  }
  catch {
    return null
  }
}
const nodeVersion = realNodeVersion()
const jsRuntime = nodeVersion ? 'node' : 'bun'
const bin = (p: string) => resolve(root, 'node_modules', p)

const version = (cmd: string) => {
  try {
    return /\d+\.\d+\.\d+/.exec(sh(`${cmd} --version`))?.[0] ?? '?'
  }
  catch {
    return '?'
  }
}

interface Tool { name: string, cmd: string, runs: number, version: string }

const oxfmt = `${jsRuntime} ${bin('oxfmt/bin/oxfmt')}`
const prettier = `${jsRuntime} ${bin('prettier/bin/prettier.cjs')}`

const tools: Tool[] = [
  {
    name: 'Pickier',
    cmd: `${pickierCli} run '${GLOB}' --mode format --check`,
    runs,
    version: version(pickierCli),
  },
  { name: 'oxfmt', cmd: `${oxfmt} --check '${GLOB}'`, runs, version: version(oxfmt) },
  { name: 'oxfmt (1 thread)', cmd: `${oxfmt} --check --threads=1 '${GLOB}'`, runs, version: version(oxfmt) },
]
if (!skipPrettier)
  tools.push({ name: 'Prettier', cmd: `${prettier} --check '${GLOB}'`, runs: prettierRuns, version: version(prettier) })

console.log(`\n${'='.repeat(80)}`)
console.log('     MARKDOWN CORPUS — Pickier vs oxfmt vs Prettier (CLI, --check)')
console.log('='.repeat(80))
console.log(`  Corpus:   mdn/content@${head.slice(0, 12)} — ${mdFiles.length} files matching ${GLOB}, ${(mdBytes / 1024 / 1024).toFixed(1)} MB`)
console.log(`  Machine:  ${cpus()[0]?.model ?? 'unknown'}, ${cpus().length} cores, bun ${Bun.version}${nodeVersion ? `, node ${nodeVersion}` : ' (no node: Node CLIs run on bun)'}`)
for (const t of tools)
  console.log(`  ${t.name.padEnd(17)} ${t.version.padEnd(10)} ${t.cmd}`)
console.log(`${'='.repeat(80)}\n`)

// ---------------------------------------------------------------------------
// Sanity pass: each tool must finish and must not crash. Exit 0 = everything
// formatted, 1 = some files would change; anything else is a failure.
// ---------------------------------------------------------------------------
for (const t of tools) {
  const r = spawnSync('sh', ['-c', t.cmd], { cwd: corpus, encoding: 'utf-8' })
  if (r.status !== 0 && r.status !== 1)
    throw new Error(`${t.name} failed (exit ${r.status}):\n${(r.stderr || r.stdout).slice(-2000)}`)
  const summary = `${r.stdout}\n${r.stderr}`.split('\n').filter(l => /files?\b/i.test(l)).pop()?.trim()
  console.log(`  ✓ ${t.name.padEnd(17)} exit ${r.status}${summary ? `  — ${summary}` : ''}`)
}
console.log()

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
interface Result { name: string, mean: number, stddev: number, min: number, max: number, runs: number }
const results: Result[] = []
mkdirSync(resultsDir, { recursive: true })

const hyperfine = which('hyperfine')
for (const t of tools) {
  if (hyperfine) {
    const json = resolve(resultsDir, `markdown-corpus-${t.name.replace(/\W+/g, '-').toLowerCase()}.json`)
    execSync(
      `hyperfine --warmup 1 --runs ${t.runs} -i --style basic -n '${t.name}' --export-json '${json}' ${JSON.stringify(t.cmd)}`,
      { cwd: corpus, stdio: 'inherit' },
    )
    const r = (await Bun.file(json).json()).results[0]
    results.push({ name: t.name, mean: r.mean, stddev: r.stddev ?? 0, min: r.min, max: r.max, runs: t.runs })
    continue
  }

  spawnSync('sh', ['-c', t.cmd], { cwd: corpus, stdio: 'ignore' }) // warmup
  const times: number[] = []
  for (let i = 0; i < t.runs; i++) {
    const t0 = performance.now()
    spawnSync('sh', ['-c', t.cmd], { cwd: corpus, stdio: 'ignore' })
    times.push((performance.now() - t0) / 1000)
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const stddev = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, times.length - 1))
  results.push({ name: t.name, mean, stddev, min: Math.min(...times), max: Math.max(...times), runs: t.runs })
  console.log(`${t.name}: ${mean.toFixed(3)} s ± ${stddev.toFixed(3)} s`)
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
results.sort((a, b) => a.mean - b.mean)
const fastest = results[0].mean
const rows = results.map(r =>
  `| ${r.name} | ${r.mean.toFixed(3)} s ± ${r.stddev.toFixed(3)} s | ${r.min.toFixed(3)} s | ${r.max.toFixed(3)} s | ${r.runs} | ${(r.mean / fastest).toFixed(1)}x |`)
const table = [
  '| Tool | Mean ± σ | Min | Max | Runs | Relative |',
  '|------|---------:|----:|----:|-----:|---------:|',
  ...rows,
].join('\n')

console.log(`\n${table}\n`)
writeFileSync(resolve(resultsDir, 'markdown-corpus.md'), `${table}\n`)
console.log(`Saved to ${resolve(resultsDir, 'markdown-corpus.md')}`)
