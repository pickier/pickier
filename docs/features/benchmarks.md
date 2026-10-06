# Benchmarks

How Pickier's formatter compares with oxfmt, Biome and Prettier. The suites live in [`bechmarks/`](https://github.com/pickier/pickier/tree/main/bechmarks) and use [mitata](https://github.com/evanwashere/mitata) for in-memory timings and [hyperfine](https://github.com/sharkdp/hyperfine) for whole-repository CLI runs.

## Test Environment

- **CPU**: Apple M3 Pro, 11 cores
- **Runtime**: Bun 1.4.2 (Node is not installed, so the Node CLIs run on Bun)
- **Tools**: Pickier (npm build), oxfmt 0.72.0, Prettier 3.9.9, Biome 1.9.4

## What Is Being Compared

oxfmt, Prettier and Biome parse each file into an AST and reprint it. Pickier's formatter is line-based: whitespace, indentation, quotes, spacing, semicolons and import organization for code, and for Markdown, trailing whitespace, blank lines and the final newline, with fenced code blocks and hard line breaks left exactly as written. The tools do not do identical work, so read the numbers as "time to get a formatted project", not as a parser-for-parser race.

Every run uses check mode, so nothing is written. Each suite first checks that every tool actually ran: a tool that fails early is never timed.

## Markdown: mdn/content

The whole of mdn/content (pinned to `5fd3b03e9ad1`): 14,706 `.md` files, 57.9 MB, `--check` over `files/**/*.md` from the repository root. One warmup, then 10 runs (3 for Prettier). Pickier runs on one thread; oxfmt uses every core unless limited with `--threads`.

| Tool | Mean ± σ | Min … Max | vs Pickier |
|------|---------:|----------:|-----------:|
| **Pickier** (1 thread) | **0.946 s ± 0.037 s** | 0.903 … 0.999 s | 1.0x |
| oxfmt (11 threads) | 2.746 s ± 0.209 s | 2.472 … 3.138 s | 2.9x slower |
| oxfmt (`--threads=1`) | 5.995 s ± 0.846 s | 5.205 … 7.660 s | 6.3x slower |
| Prettier | 79.020 s ± 3.064 s | 75.850 … 81.965 s | 83.5x slower |

## Markdown: In Memory

Each tool formats the same string through its JS API: Pickier `formatCode()`, oxfmt `format()`, Prettier `format({ parser: 'markdown' })`.

| File | Pickier | oxfmt | Prettier |
|------|--------:|------:|---------:|
| Small (88 lines, 2.3 KB) | **3.74 µs** | 60.1 µs | 1.01 ms |
| Medium (451 lines, 14.9 KB) | **22.5 µs** | 127 µs | 7.74 ms |
| Large (1,755 lines, 88 KB) | **137 µs** | 2.56 ms | 89.0 ms |
| All three x 10 (throughput) | **1.29 ms** | 23.4 ms | 994 ms |

## TypeScript: In Memory

Pickier, oxfmt and Prettier through their JS APIs; Biome has no JS formatting API, so it is piped through stdin.

| File | Pickier | oxfmt | Prettier | Biome (stdin) |
|------|--------:|------:|---------:|--------------:|
| Small (52 lines, 1 KB) | **22.9 µs** | 70.9 µs | 1.02 ms | 18.6 ms |
| Medium (419 lines, 10 KB) | **197 µs** | 329 µs | 7.69 ms | 21.9 ms |
| Large (1,279 lines, 31 KB) | **557 µs** | 825 µs | 19.1 ms | 25.4 ms |
| Large x 20 (throughput) | **10.8 ms** | 16.6 ms | 355 ms | 504 ms |

## TypeScript: CLI

Every tool spawns a process and reads the file from disk, with no config file in the working directory.

| File | Pickier | oxfmt | Biome | Prettier |
|------|--------:|------:|------:|---------:|
| Small (52 lines) | **15.6 ms** | 28.7 ms | 23.0 ms | 70.1 ms |
| Medium (419 lines) | **16.9 ms** | 28.8 ms | 33.3 ms | 102.6 ms |
| Large (1,279 lines) | **18.5 ms** | 30.0 ms | 67.7 ms | 125.3 ms |
| All three, sequentially | **54.1 ms** | 93.2 ms | 122.8 ms | 291.8 ms |

## Running Benchmarks

```bash
bun run --cwd packages/pickier build   # the CLI benchmarks spawn the npm build
cd bechmarks
bun install

bun run bench:markdown-corpus     # Markdown, whole repository (clones mdn/content, ~200 MB)
bun run bench:markdown            # Markdown, in memory
bun run bench:format-comparison   # TypeScript, in memory and CLI
```

See [`bechmarks/README.md`](https://github.com/pickier/pickier/blob/main/bechmarks/README.md) for every suite, its options and the linting tables.
