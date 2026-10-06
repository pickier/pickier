# Benchmarks

How Pickier compares with oxfmt, oxlint, Biome, Prettier and ESLint. The suites live in [`bechmarks/`](https://github.com/pickier/pickier/tree/main/bechmarks). They use [mitata](https://github.com/evanwashere/mitata) for in-process and per-invocation timings, and [hyperfine](https://github.com/sharkdp/hyperfine) for whole-repository CLI runs.

## Test Environment

- **CPU**: Apple M3 Pro, 11 cores (load average 4–7 during the runs: not an idle machine)
- **Runtime**: Bun 1.4.2, Node 26.10.0 (for ESLint, oxlint and the oxfmt and Prettier launchers)
- **Tools**: Pickier (npm build), oxfmt 0.72.0, oxlint 1.87.0, Prettier 3.9.9, Biome 2.5.15, ESLint 10.12.0 with typescript-eslint 8.71.1

## What Is Being Compared

oxfmt, Prettier and Biome parse each file into an AST and reprint it. Pickier's formatter is line-based: for code, it handles whitespace, indentation, quotes, spacing, semicolons and import organization. For Markdown, it handles trailing whitespace, blank lines and the final newline, and leaves fenced code blocks and hard line breaks exactly as written. The tools do not do identical work, so read the numbers as "time to get a formatted project", not as a parser-for-parser race.

Each linter runs its own default rules. ESLint gets its recommended rules plus typescript-eslint's, since it will not run without a config. Pickier's CLI lints TS/JS files with its native engine on every core, which reports exactly what its TypeScript rules report.

Formatters run in check mode, so nothing is written. Each suite first checks that every tool actually ran: a tool that fails early is never timed.

## Markdown: mdn/content

The whole of mdn/content (pinned to `5fd3b03e9ad1`): 14,706 `.md` files, 57.9 MB, `--check` over `files/**/*.md` from the repository root. One warmup, then 10 runs (3 for Prettier). Both Pickier and oxfmt use every core unless limited. The single-thread rows use `PICKIER_WORKERS=0` and `--threads=1`.

| Tool | Mean ± σ | Min … Max | vs Pickier |
|------|---------:|----------:|-----------:|
| **Pickier** | **0.580 s ± 0.010 s** | 0.566 … 0.598 s | 1.0x |
| Pickier (1 thread) | 0.820 s ± 0.021 s | 0.802 … 0.867 s | 1.4x slower |
| oxfmt | 2.057 s ± 0.041 s | 2.008 … 2.114 s | 3.5x slower |
| oxfmt (`--threads=1`) | 5.460 s ± 0.052 s | 5.395 … 5.543 s | 9.4x slower |
| Prettier | 79.699 s ± 1.300 s | 78.766 … 81.184 s | 137x slower |

## Markdown: In Memory

Each tool formats the same string through its JS API: Pickier `formatCode()`, oxfmt `format()`, Prettier `format({ parser: 'markdown' })`.

| File | Pickier | oxfmt | Prettier |
|------|--------:|------:|---------:|
| Small (88 lines, 2.3 KB) | **3.57 µs** | 58.2 µs | 833 µs |
| Medium (451 lines, 14.9 KB) | **21.2 µs** | 118 µs | 6.83 ms |
| Large (1,755 lines, 88 KB) | **98.4 µs** | 1.99 ms | 83.5 ms |
| All three x 10 (throughput) | **1.24 ms** | 22.0 ms | 911 ms |

## TypeScript: In Memory

Pickier, oxfmt and Prettier through their JS APIs. Biome has no JS formatting API, so it is piped through stdin.

| File | Pickier | oxfmt | Prettier | Biome (stdin) |
|------|--------:|------:|---------:|--------------:|
| Small (52 lines, 1 KB) | **15.4 µs** | 67.7 µs | 933 µs | 44.7 ms |
| Medium (419 lines, 10 KB) | **141 µs** | 304 µs | 6.80 ms | 45.8 ms |
| Large (1,279 lines, 31 KB) | **397 µs** | 769 µs | 17.9 ms | 48.9 ms |
| Large x 20 (throughput) | **7.77 ms** | 15.4 ms | 336 ms | 987 ms |

## TypeScript: CLI

Every tool spawns a process and reads the file from disk, with no config file in the working directory.

| File | Pickier | oxfmt | Biome | Prettier |
|------|--------:|------:|------:|---------:|
| Small (52 lines) | **14.9 ms** | 44.3 ms | 48.2 ms | 90.5 ms |
| Medium (419 lines) | **16.4 ms** | 43.9 ms | 57.1 ms | 118 ms |
| Large (1,279 lines) | **17.0 ms** | 45.8 ms | 91.6 ms | 151 ms |
| All three, sequentially | **49.4 ms** | 133 ms | 193 ms | 364 ms |

## Linting

One CLI invocation per file, then a whole project in one invocation: a fresh copy of `packages/pickier/src`, 299 files. Every linter is checked to have covered all 299.

| | Pickier | oxlint | Biome | ESLint |
|---|--------:|-------:|------:|-------:|
| Small (52 lines) | **22.4 ms** | 45.6 ms | 46.1 ms | 330 ms |
| Medium (419 lines) | **23.1 ms** | 44.9 ms | 50.1 ms | 341 ms |
| Large (1,279 lines) | **23.9 ms** | 44.7 ms | 79.1 ms | 359 ms |
| Whole project (299 files) | **34.7 ms** | 50.1 ms | 112 ms | 1.27 s |

Lint and format-check together, all three fixtures, one process per tool and file: Pickier **113 ms**, Biome 194 ms, oxlint + oxfmt 261 ms, ESLint + Prettier 1.02 s.

## Running Benchmarks

```bash
bun run --cwd packages/pickier build   # the CLI benchmarks spawn the npm build
cd bechmarks
bun install

bun run bench:markdown-corpus     # Markdown, whole repository (clones mdn/content, ~200 MB)
bun run bench:markdown            # Markdown, in memory
bun run bench:format-comparison   # TypeScript, in memory and CLI
bun run bench:lint                # Linting, per file and whole project
bun run bench:combined            # Lint + format
```

ESLint, oxlint and the oxfmt and Prettier launchers need Node on `PATH`. See [`bechmarks/README.md`](https://github.com/pickier/pickier/blob/main/bechmarks/README.md) for every suite and its options.
