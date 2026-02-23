# Pickier Benchmarks

Performance benchmarks comparing Pickier against other tools. All benchmarks use [mitata](https://github.com/evanwashere/mitata) and run on Bun.

## Results

Measured on an Apple M3 Pro with Bun 1.3.10. All tools use equivalent settings (single quotes, no semicolons, 2-space indent). Pickier and Prettier use their in-memory APIs; oxfmt and Biome have no JS formatting API, so they are called via stdin pipe.

### Formatting — In-memory API

Pickier `formatCode()` and Prettier `format()` run in-process. oxfmt and Biome are piped via stdin (no JS formatting API).

| File | Pickier | Biome (stdin) | oxfmt (stdin) | Prettier |
|------|--------:|--------------:|--------------:|---------:|
| Small (52 lines, 1 KB) | **41 µs** | 40 ms | 51 ms | 1.59 ms |
| Medium (419 lines, 10 KB) | **417 µs** | 42 ms | 50 ms | 10.2 ms |
| Large (1,279 lines, 31 KB) | **1.25 ms** | 46 ms | 50 ms | 28.1 ms |

Pickier's in-memory API is 22-39x faster than Prettier and orders of magnitude faster than tools that must spawn a process per call.

### Formatting — CLI

All four tools spawn a process and read the file from disk. Pickier uses its compiled native binary (`bun build --compile --minify`).

| File | Pickier (Zig) | Biome | oxfmt | Prettier |
|------|-------------:|------:|------:|---------:|
| Small (52 lines) | **17.5 ms** | 39.6 ms | 63.3 ms | 86.3 ms |
| Medium (419 lines) | **16.2 ms** | 48.1 ms | 64.3 ms | 120.6 ms |
| Large (1,279 lines) | **16.4 ms** | 85.8 ms | 63.7 ms | 147.4 ms |

Pickier's compiled Zig binary is **2.3–9x faster than Biome**, **3.8–4x faster than oxfmt**, and **5–9x faster than Prettier** across file sizes.

### Formatting — CLI Batch (all fixtures sequential)

| Tool | Time |
|------|-----:|
| Pickier (Zig) | **50 ms** |
| Biome | 167 ms |
| oxfmt | 186 ms |
| Prettier | 353 ms |

### Formatting — Throughput (large file x 20)

| Tool | Time |
|------|-----:|
| Pickier | **21 ms** |
| Prettier | 439 ms |
| Biome (stdin) | 857 ms |
| oxfmt (stdin) | 892 ms |

At scale, Pickier is **21x faster** than Prettier and **40x faster** than Biome/oxfmt.

### Linting — Pickier vs ESLint vs oxlint vs Biome

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

# All benchmarks
bun run bench

# Individual suites
bun run bench:lint        # Linting: Pickier vs ESLint
bun run bench:format      # Formatting: Pickier vs Prettier vs Biome
bun run bench:combined    # Combined lint + format workflows
bun run bench:format-comparison  # Pickier vs oxfmt vs Biome vs Prettier
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

Head-to-head formatting comparison of Pickier, oxfmt, Biome, and Prettier. Includes in-memory API, CLI single-file, CLI batch, and throughput benchmarks. oxfmt and Biome are called via stdin since they have no JS formatting API.

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

## Environment Variables

```bash
PICKIER_CONCURRENCY=16       # Parallel file processing workers (default: 8)
PICKIER_NO_AUTO_CONFIG=1     # Skip config file loading
PICKIER_TIMEOUT_MS=8000      # Glob timeout in ms
PICKIER_RULE_TIMEOUT_MS=5000 # Per-rule timeout in ms
```

## Tips for Accurate Results

- Close other applications to reduce CPU noise
- Run multiple times for statistical significance
- First runs are often slower due to JIT warmup
