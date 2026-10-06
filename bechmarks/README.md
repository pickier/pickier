# Pickier Benchmarks

Performance benchmarks comparing Pickier against other tools. All benchmarks use [mitata](https://github.com/evanwashere/mitata) and run on Bun.

## Results

Measured on an Apple M3 Pro (11 cores) with Bun 1.4.2, oxfmt 0.72.0, Prettier 3.9.9 and Biome 1.9.4. Node is not installed on this machine, so the Node CLIs (Prettier, the oxfmt launcher) run on Bun.

What each tool does differs, and the numbers should be read with that in mind: oxfmt, Prettier and Biome parse to an AST and reprint the file; Pickier's formatter is line-based (whitespace, indentation, quotes, spacing, semicolons, imports) and, for Markdown, normalizes whitespace while leaving code blocks verbatim. Every tool runs in check mode, and every benchmark first confirms each tool actually ran — a tool that exits early is never timed.

### Markdown — mdn/content (CLI, whole repository)

From `bench:markdown-corpus`: mdn/content pinned at `5fd3b03e9ad1`, 14,706 `.md` files (57.9 MB), `--check` over `files/**/*.md`, timed with hyperfine (1 warmup, 10 runs; 3 for Prettier). Pickier is the npm build, which runs on one thread; oxfmt uses every core unless told otherwise.

| Tool | Mean ± σ | Min … Max | vs Pickier |
|------|---------:|----------:|-----------:|
| **Pickier** (1 thread) | **0.946 s ± 0.037 s** | 0.903 … 0.999 s | 1.0x |
| oxfmt (11 threads) | 2.746 s ± 0.209 s | 2.472 … 3.138 s | 2.9x slower |
| oxfmt (`--threads=1`) | 5.995 s ± 0.846 s | 5.205 … 7.660 s | 6.3x slower |
| Prettier | 79.020 s ± 3.064 s | 75.850 … 81.965 s | 83.5x slower |

### Markdown — in-memory API

From `bench:markdown`: each tool formats the same string through its JS API (Pickier `formatCode()`, oxfmt `format()`, Prettier `format({ parser: 'markdown' })`). Fixtures are copies of this repo's docs.

| File | Pickier | oxfmt | Prettier |
|------|--------:|------:|---------:|
| Small (88 lines, 2.3 KB) | **3.74 µs** | 60.1 µs | 1.01 ms |
| Medium (451 lines, 14.9 KB) | **22.5 µs** | 127 µs | 7.74 ms |
| Large (1,755 lines, 88 KB) | **137 µs** | 2.56 ms | 89.0 ms |
| All three x 10 (throughput) | **1.29 ms** | 23.4 ms | 994 ms |

### TypeScript formatting — in-memory API

From `bench:format-comparison`. Pickier, oxfmt and Prettier run in-process through their JS APIs; Biome has no JS formatting API, so it is piped through stdin.

| File | Pickier | oxfmt | Prettier | Biome (stdin) |
|------|--------:|------:|---------:|--------------:|
| Small (52 lines, 1 KB) | **22.9 µs** | 70.9 µs | 1.02 ms | 18.6 ms |
| Medium (419 lines, 10 KB) | **197 µs** | 329 µs | 7.69 ms | 21.9 ms |
| Large (1,279 lines, 31 KB) | **557 µs** | 825 µs | 19.1 ms | 25.4 ms |
| Large x 20 (throughput) | **10.8 ms** | 16.6 ms | 355 ms | 504 ms |

### TypeScript formatting — CLI

Every tool spawns a process and reads the file from disk, in check mode, with no config file in the working directory. Pickier is the npm build (`dist/bin/cli.js`).

| File | Pickier | oxfmt | Biome | Prettier |
|------|--------:|------:|------:|---------:|
| Small (52 lines) | **15.6 ms** | 28.7 ms | 23.0 ms | 70.1 ms |
| Medium (419 lines) | **16.9 ms** | 28.8 ms | 33.3 ms | 102.6 ms |
| Large (1,279 lines) | **18.5 ms** | 30.0 ms | 67.7 ms | 125.3 ms |
| All three, sequentially | **54.1 ms** | 93.2 ms | 122.8 ms | 291.8 ms |

### Linting — Pickier vs ESLint vs oxlint vs Biome

> The lint and combined tables were measured on an earlier release with the Zig port as `pickier (cli)`, and have not been re-run since the CLI benchmarks switched to the npm build. ESLint needs Node, which this machine does not have.

From the `bench:lint` suite. `pickier (api)` = programmatic in-process (no spawn overhead). `pickier (cli)` = native Zig binary — the fair CLI-vs-CLI comparison. ESLint runs via `node` since its `ajv` dependency has a Bun compat issue.

| File | Pickier (api) | Pickier (cli) | ESLint (node) | oxlint | Biome |
|------|-------------:|--------------:|--------------:|-------:|------:|
| Small (52 lines) | **249 µs** | **19 ms** | 57 ms | 47 ms | 38 ms |
| Medium (419 lines) | **1.73 ms** | **21 ms** | 57 ms | 47 ms | 41 ms |
| Large (1,279 lines) | **4.43 ms** | **28 ms** | 57 ms | 49 ms | 45 ms |
| All files (batch) | **40 µs** | **62 ms** | 172 ms | 144 ms | 129 ms |

Pickier's CLI binary is **2–3x faster than Biome** and **2–3x faster than oxlint** CLI-vs-CLI. The programmatic API is another **100–1000x faster** on top of that.

### Combined — Lint + Format Workflow

From the `bench:combined` suite. Two Pickier rows: `(api)` = programmatic in-process, `(cli)` = native Zig binary doing both lint + format. ESLint runs via `node`.

| File | Pickier (api) | Pickier (cli) | ESLint + Prettier | oxlint + oxfmt | Biome |
|------|-------------:|--------------:|------------------:|---------------:|------:|
| Small (52 lines) | **303 µs** | **35 ms** | 63 ms | 94 ms | 41 ms |
| Medium (419 lines) | **2.19 ms** | **38 ms** | 74 ms | 94 ms | 54 ms |
| Large (1,279 lines) | **5.98 ms** | **49 ms** | 93 ms | 102 ms | 91 ms |
| All files (batch) | **8.24 ms** | **125 ms** | 238 ms | 286 ms | 184 ms |

Pickier's CLI binary is **1.8–2x faster than Biome** and **1.7–2x faster than ESLint + Prettier** CLI-vs-CLI. The programmatic API is another **10–300x faster** on top.

## Running

```bash
bun install
bun run --cwd ../packages/pickier build   # CLI benchmarks spawn the npm build

# All benchmarks
bun run bench

# Individual suites
bun run bench:lint        # Linting: Pickier vs ESLint
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

Compares Pickier's programmatic linting API against ESLint across small (52 lines), medium (419 lines), and large (1,279 lines) TypeScript fixtures. Tests single-file linting, batch linting, and cold/warm performance.

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
```

## Tips for Accurate Results

- Close other applications to reduce CPU noise
- Run multiple times for statistical significance
- First runs are often slower due to JIT warmup
