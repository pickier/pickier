# Pickier Benchmarks

Performance benchmarks comparing Pickier against other tools. All benchmarks use [mitata](https://github.com/evanwashere/mitata) and run on Bun.

## Results

Measured on an Apple M3 Pro (11 cores) with Bun 1.4.2 and Node 26.10.0. Tool versions: oxfmt 0.72.0, oxlint 1.87.0, Prettier 3.9.9, Biome 2.5.15, and ESLint 10.12.0 with typescript-eslint 8.71.1. The machine was not idle: its load average stayed between 4 and 7 throughout. The mitata suites report means; the corpus run reports hyperfine's mean ± σ.

The tools do not do identical work, so read the numbers with that in mind:

- **Formatting:** oxfmt, Prettier and Biome parse each file to an AST and reprint it. Pickier's formatter is line-based (whitespace, indentation, quotes, spacing, semicolons, imports). For Markdown it normalizes whitespace and leaves code blocks verbatim.
- **Linting:** each linter runs its own default rule set, which differs from tool to tool. ESLint uses `eslint.config.js` here, its recommended rules plus typescript-eslint's, because without a config it exits before linting.

Every formatter runs in check mode. Before anything is timed, each suite confirms that every tool actually ran and produced output, so a tool that exits early is never timed. The whole-project row also confirms each linter covered all 299 files.

### Markdown — mdn/content (CLI, whole repository)

From `bench:markdown-corpus`. mdn/content pinned at `5fd3b03e9ad1`: 14,706 `.md` files (57.9 MB), `--check` over `files/**/*.md`, timed with hyperfine (1 warmup, 10 runs; 3 for Prettier). Pickier is the npm build and, like oxfmt, uses every core unless told otherwise. The single-thread rows pair `PICKIER_WORKERS=0` with oxfmt's `--threads=1`.

| Tool | Mean ± σ | Min … Max | vs Pickier |
|------|---------:|----------:|-----------:|
| **Pickier** | **0.580 s ± 0.010 s** | 0.566 … 0.598 s | 1.0x |
| Pickier (1 thread) | 0.820 s ± 0.021 s | 0.802 … 0.867 s | 1.4x slower |
| oxfmt | 2.057 s ± 0.041 s | 2.008 … 2.114 s | 3.5x slower |
| oxfmt (`--threads=1`) | 5.460 s ± 0.052 s | 5.395 … 5.543 s | 9.4x slower |
| Prettier | 79.699 s ± 1.300 s | 78.766 … 81.184 s | 137x slower |

On one thread each, Pickier is 6.7x faster than oxfmt.

### Markdown — in-memory API

From `bench:markdown`: each tool formats the same string through its JS API: Pickier `formatCode()`, oxfmt `format()`, Prettier `format({ parser: 'markdown' })`. The fixtures are copies of this repo's docs.

| File | Pickier | oxfmt | Prettier |
|------|--------:|------:|---------:|
| Small (88 lines, 2.3 KB) | **3.57 µs** | 58.2 µs | 833 µs |
| Medium (451 lines, 14.9 KB) | **21.2 µs** | 118 µs | 6.83 ms |
| Large (1,755 lines, 88 KB) | **98.4 µs** | 1.99 ms | 83.5 ms |
| All three x 10 (throughput) | **1.24 ms** | 22.0 ms | 911 ms |

### TypeScript formatting — in-memory API

From `bench:format-comparison`. Pickier, oxfmt and Prettier run in-process through their JS APIs; Biome has no JS formatting API, so it is piped through stdin.

| File | Pickier | oxfmt | Prettier | Biome (stdin) |
|------|--------:|------:|---------:|--------------:|
| Small (52 lines, 1 KB) | **15.4 µs** | 67.7 µs | 933 µs | 44.7 ms |
| Medium (419 lines, 10 KB) | **141 µs** | 304 µs | 6.80 ms | 45.8 ms |
| Large (1,279 lines, 31 KB) | **397 µs** | 769 µs | 17.9 ms | 48.9 ms |
| Large x 20 (throughput) | **7.77 ms** | 15.4 ms | 336 ms | 987 ms |

### TypeScript formatting — CLI

Every tool spawns a process and reads the file from disk, in check mode, with no config file in the working directory. Pickier is the npm build (`dist/bin/cli.js`).

| File | Pickier | oxfmt | Biome | Prettier |
|------|--------:|------:|------:|---------:|
| Small (52 lines) | **14.9 ms** | 44.3 ms | 48.2 ms | 90.5 ms |
| Medium (419 lines) | **16.4 ms** | 43.9 ms | 57.1 ms | 118 ms |
| Large (1,279 lines) | **17.0 ms** | 45.8 ms | 91.6 ms | 151 ms |
| All three, sequentially | **49.4 ms** | 133 ms | 193 ms | 364 ms |

### Linting — Pickier vs ESLint vs oxlint vs Biome

From `bench:lint`, with each linter on its default rules (see above):

- **`pickier (api)`:** `runLintProgrammatic()` in-process, with no process start.
- **CLIs:** every other column spawns the tool's CLI. Pickier's is the npm build, which lints TS/JS files with its native engine (`dist/native`) on every core, and reports exactly what its TypeScript rules report.

| File | Pickier (api) | Pickier (cli) | oxlint | Biome | ESLint |
|------|-------------:|--------------:|-------:|------:|-------:|
| Small (52 lines) | **180 µs** | **22.4 ms** | 45.6 ms | 46.1 ms | 330 ms |
| Medium (419 lines) | **1.24 ms** | **23.1 ms** | 44.9 ms | 50.1 ms | 341 ms |
| Large (1,279 lines) | **4.30 ms** | **23.9 ms** | 44.7 ms | 79.1 ms | 359 ms |
| All three, one process each | **6.51 ms** | **71.7 ms** | 133 ms | 175 ms | 1.08 s |
| Whole project (`packages/pickier/src`, 299 files, one invocation) | — | **34.7 ms** | 50.1 ms | 112 ms | 1.27 s |

### Combined — Lint + Format Workflow

From `bench:combined`: lint and format-check each fixture. Pickier does both in one tool; the others take two tools, except Biome, which does both in one `biome check`.

| File | Pickier (api) | Pickier (cli) | Biome | oxlint + oxfmt | ESLint + Prettier |
|------|-------------:|--------------:|------:|---------------:|------------------:|
| Small (52 lines) | **204 µs** | **38.5 ms** | 50.3 ms | 90.7 ms | 338 ms |
| Medium (419 lines) | **1.47 ms** | **40.7 ms** | 62.9 ms | 87.3 ms | 350 ms |
| Large (1,279 lines) | **4.64 ms** | **39.1 ms** | 78.0 ms | 89.0 ms | 375 ms |
| All three, one process each | **6.19 ms** | **113 ms** | 194 ms | 261 ms | 1.02 s |

## Running

```bash
bun install
bun run --cwd ../packages/pickier build   # CLI benchmarks spawn the npm build

# All benchmarks
bun run bench

# Individual suites
bun run bench:lint        # Linting: Pickier vs ESLint vs oxlint vs Biome
bun run bench:format      # Formatting: Pickier vs Prettier vs Biome
bun run bench:combined    # Combined lint + format workflows
bun run bench:format-comparison  # Pickier vs oxfmt vs Biome vs Prettier
bun run bench:markdown    # Markdown in memory: Pickier vs oxfmt vs Prettier
bun run bench:markdown-corpus  # Markdown on mdn/content: CLI vs CLI (clones ~200 MB)
bun run bench:memory      # Memory usage under repeated operations
bun run bench:parsing     # AST parsing: TypeScript vs Babel
bun run bench:rules       # Individual rule execution overhead
bun run bench:comparison  # Comparison tables with detailed output
bun run bench:breakdown   # Per-file-size analysis with code metrics
bun run bench:all         # lint + format + combined sequentially
```

## Benchmark Suites

### Linting (`bench:lint`)

Pickier (in-process API and CLI), ESLint, oxlint and Biome on the small, medium and large fixtures, one file per invocation, then on a whole project in one invocation: a fresh copy of `packages/pickier/src` (299 files). Each CLI is run once before timing to confirm it works, and the project run checks that every tool linted every file.

### Formatting (`bench:format`)

Compares Pickier's formatting against Prettier and Biome. Covers single-file formatting, multi-file batches, in-memory string formatting, and parallel processing.

### Combined (`bench:combined`)

Tests real-world lint + format workflows. Compares Pickier's integrated approach against running ESLint + Prettier as separate tools, both sequential and parallel.

### Format Comparison (`bench:format-comparison`)

Head-to-head formatting comparison of Pickier, oxfmt, Biome, and Prettier. Includes in-memory API, CLI single-file, CLI batch, and throughput benchmarks. Pickier, oxfmt and Prettier use their JS APIs in memory; Biome has no JS formatting API, so it is called via stdin.

### Markdown (`bench:markdown`)

Pickier, oxfmt and Prettier formatting the Markdown fixtures in memory through their JS APIs, per file and as a throughput loop. Each tool formats every fixture once before timing so a failing tool cannot be timed.

### Markdown Corpus (`bench:markdown-corpus`)

CLI-vs-CLI on a real repository: mdn/content, pinned to one commit and shallow-cloned into `.cache/mdn-content` on first run. Pickier, oxfmt (all cores and `--threads=1`) and Prettier each run `--check` over `files/**/*.md` from the corpus root. A sanity pass aborts if any tool exits with anything but 0 or 1, and the run refuses to start if the corpus has local changes. Timing uses hyperfine when installed and a built-in loop otherwise; results go to `results/`.

| Variable | Default | |
|----------|--------:|-|
| `MD_BENCH_RUNS` | 10 | runs per tool |
| `MD_BENCH_PRETTIER_RUNS` | 3 | Prettier takes over a minute per run |
| `MD_BENCH_SKIP_PRETTIER` | unset | `1` leaves Prettier out |

### Memory (`bench:memory`)

Measures memory consumption under load: repeated operations (100x, 1000x), stability/leak detection, large batch processing, and concurrent processing.

### Parsing (`bench:parsing`)

Compares TypeScript's built-in parser against Babel for AST generation speed, traversal, repeated parsing, and error recovery.

### Rules (`bench:rules`)

Measures individual rule execution times, multi-rule overhead, scaling by file size, and plugin coordination costs.

### Comparison Report (`bench:comparison`)

Generates formatted comparison tables covering linting, formatting, combined workflows, throughput, and batch processing.

### Breakdown (`bench:breakdown`)

Per-file-size analysis with detailed code metrics (lines, code density, imports/exports, functions, classes, interfaces) and scaling characteristics.

## Fixtures

Three TypeScript files in `fixtures/` designed to cover different scales:

| Fixture | Lines | Size | Description |
|---------|------:|-----:|-------------|
| `small.ts` | 52 | 1 KB | Simple class with basic TypeScript patterns |
| `medium.ts` | 419 | 10 KB | Multiple classes, async/await, Express patterns |
| `large.ts` | 1,279 | 31 KB | Full application with services, repositories, and complex types |

And three Markdown files in `fixtures/markdown/`, copied from this repository's docs:

| Fixture | Lines | Size | Source |
|---------|------:|-----:|--------|
| `small.md` | 88 | 2.3 KB | `docs/usage.md` |
| `medium.md` | 451 | 14.9 KB | `docs/rules/markdown.md` |
| `large.md` | 1,755 | 88.0 KB | `CHANGELOG.md` |

## Environment Variables

```bash
PICKIER_CONCURRENCY=16       # Parallel file processing workers (default: 8)
PICKIER_NO_AUTO_CONFIG=1     # Skip config file loading
PICKIER_TIMEOUT_MS=8000      # Glob timeout in ms
PICKIER_RULE_TIMEOUT_MS=5000 # Per-rule timeout in ms
PICKIER_BENCH_ZIG=1          # CLI benchmarks spawn packages/zig's build instead of the npm CLI
PICKIER_WORKERS=4            # Worker threads for a run over many files (default: one per core; 0 = main thread only)
PICKIER_NATIVE=0             # Lint on the TypeScript path only, without the native engine
```

## Tips for Accurate Results

- Close other applications to reduce CPU noise
- Put the Bun you mean to measure first on `PATH`: the CLI benchmarks spawn `bun`, and an older Bun found first changes Pickier's numbers
- ESLint, oxlint and the oxfmt and Prettier launchers need Node on `PATH`; without it they fail, and the sanity checks stop the run
- Run multiple times for statistical significance
- First runs are often slower due to JIT warmup
