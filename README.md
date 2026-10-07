<p align="center"><img src=".github/art/cover.jpg" alt="Social Card of this repo"></p>

[![npm version](https://img.shields.io/npm/v/pickier?style=flat-square)](https://npmjs.com/package/pickier)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/pickier/pickier/ci.yml?style=flat-square&branch=main)](https://github.com/pickier/pickier/actions?query=workflow%3Aci)

# Pickier

> Fast linting and formatting. Minimal defaults. Extensible. Built for speed.

## Features

- Fast CLI with instant feedback
- Lint and format in one tool
- Zero-config defaults; simple, typed `pickier.config.ts` when you need it
- Import organization: splits type/value imports, sorts modules/specifiers, removes unused named imports
- JSON and config sorting for common files (e.g. `package.json`, `tsconfig.json`)
- Tailwind CSS class ordering — enforces canonical class order across HTML/JSX/TSX/Vue/Svelte/STX files with auto-fix
- Markdown linting for documentation quality (headings, lists, links, code blocks, tables, etc.) with auto-fix support
- Shell script linting & formatting — 21 rules for `.sh`, `.bash`, and `.zsh` files covering error prevention, style, and best practices with auto-fix support and indentation normalization
- Optional spell checking — 234K-word dictionary with 150+ common misspelling corrections, powered by [ts-spell-check](https://github.com/stacksjs/ts-spell-check)
- Flexible formatting: `indent`, `indentStyle` (tabs or spaces), `quotes`, `semi`, `trimTrailingWhitespace`, `maxConsecutiveBlankLines`, `finalNewline`
- Smart whitespace cleanup
- Package.json validation for correct npm publishing (exports ordering, file format, module system, etc.)
- ESLint-style plugin system for lint rules (load plugins, enable/disable rules, WIP labeling)
- CI-friendly reporters (stylish, compact, JSON) and strict `--max-warnings` control
- Programmatic API for custom tooling and editor integrations

## Install

```bash
# as a dev dependency
bun add -D pickier

# or
npm i -D pickier

# or
pnpm add -D pickier

# or
yarn add -D pickier
```

You can also run it directly via npx without installing:

```bash
npx pickier --help

# or
bunx pickier --help
```

## Quick Start

```bash
# Lint your project
pickier .

# Auto-fix lint issues
pickier . --fix

# Format files
pickier . --format

# Check formatting without writing (CI-friendly)
pickier . --format --check

# Preview fixes without writing
pickier . --fix --dry-run
```

By default, `pickier` lints. Use `--fix` to auto-fix problems or `--format` to format files.

## CLI

### `pickier [...globs]`

Lints by default. Add `--fix` to auto-fix or `--format` to format files.

```bash
# These are equivalent
pickier .
pickier lint .

# These are equivalent
pickier . --fix
pickier lint . --fix

# These are equivalent
pickier . --format
pickier format . --write
```

### `pickier lint [...globs]`

Lint files.

| Flag | Description | Default |
|------|-------------|---------|
| `--fix` | Auto-fix problems | `false` |
| `--dry-run` | Simulate fixes without writing | `false` |
| `--max-warnings <n>` | Fail if warnings exceed _n_ | `-1` |
| `--reporter <name>` | `stylish`, `json`, or `compact` | `stylish` |
| `--ext <exts>` | Comma-separated extensions (overrides config) | — |
| `--ignore-path <file>` | Optional ignore file (e.g. `.gitignore`) | — |
| `--config <path>` | Path to pickier config file | — |
| `--cache` | Reuse results for unchanged files (stored in `.pickiercache`) | `false` |
| `--verbose` | Verbose output | `false` |

### `pickier format [...globs]`

Format files.

| Flag | Description | Default |
|------|-------------|---------|
| `--write` | Write changes to files | `false` |
| `--check` | Check without writing, non-zero exit on differences (CI-friendly) | `false` |
| `--ext <exts>` | Comma-separated extensions (overrides config) | — |
| `--ignore-path <file>` | Optional ignore file (e.g. `.gitignore`) | — |
| `--config <path>` | Path to pickier config file | — |
| `--verbose` | Verbose output | `false` |

### `pickier run [...globs]`

Unified command that routes to lint or format based on `--mode`.

| Flag | Description | Default |
|------|-------------|---------|
| `--mode <mode>` | `auto`, `lint`, or `format` | `auto` |

Accepts all flags from both `lint` and `format`. Useful for scripts that need explicit mode control.

## Configuration

Pickier works out-of-the-box. To customize, create `pickier.config.ts` in your project root. All fields are optional.

```ts
// pickier.config.ts
import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  verbose: false,
  ignores: ['**/node_modules/**', '**/dist/**', '**/build/**'],

  lint: {
    // which extensions to lint ('.ts' or 'ts' both supported)
    extensions: ['ts', 'js'],
    // stylish | json | compact
    reporter: 'stylish',
    // reserved (not used yet)
    cache: false,
    // -1 disables, otherwise fail when warnings > maxWarnings
    maxWarnings: -1,
  },

  format: {
    // which extensions to format
    extensions: ['ts', 'js', 'json', 'md', 'yaml', 'yml', 'sh', 'bash', 'zsh'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    // one | two | none
    finalNewline: 'one',
    // indentation width (code files)
    indent: 2,
    // 'spaces' | 'tabs'
    indentStyle: 'spaces',
    // preferred string quotes: 'single' | 'double'
    quotes: 'single',
    // when true, safely remove stylistic semicolons
    // (never touches for(;;) headers; removes duplicate/empty semicolons)
    semi: false,
  },

  rules: {
    // 'off' | 'warn' | 'error'
    noDebugger: 'error',
    noConsole: 'warn',
  },

  // Tailwind CSS class ordering (auto-enables pickier/sort-tailwind-classes at 'warn')
  tailwind: {
    enabled: true,
    // configPath: './tailwind.config.ts', // optional
  },

  // Plugin rules for markdown, shell, style, sorting, etc.
  pluginRules: {
    // Markdown linting (53+ rules available)
    'markdown/heading-increment': 'error',
    'markdown/no-trailing-spaces': 'error',
    'markdown/fenced-code-language': 'error',
    'markdown/no-duplicate-heading': 'warn',

    // Shell script linting (21 rules available)
    'shell/command-substitution': 'error',
    'shell/no-eval': 'error',
    'shell/quote-variables': 'warn',
    'shell/prefer-double-brackets': 'warn',
  },
}

export default config
```

### Plugin System

Pickier supports an ESLint-style plugin system for lint rules organized into focused categories.

#### Available Plugins

| Plugin | Description | Rules |
|--------|-------------|-------|
| `pickier/` | Sorting, import organization, Tailwind class ordering, and core checks | 18+ |
| `general/` | Error detection and possible problems | 35+ |
| `quality/` | Best practices and code quality | 40+ |
| `style/` | Code style enforcement (spacing, punctuation, line breaks, etc.) | 50+ |
| `ts/` | TypeScript-specific rules (type safety, formatting) | 13+ |
| `regexp/` | Regular expression safety | 3+ |
| `markdown/` | Markdown documentation linting | 53+ |
| `shell/` | Shell script linting & formatting (`.sh`, `.bash`, `.zsh`) | 21 |
| `spell/` | Spell checking (optional, requires `ts-spell-check`) | 3 |
| `publint/` | Package.json validation for npm publishing ([publint](https://publint.dev) rules) | 20 |
| `lockfile/` | Lock file validation | 5+ |

Configure rules via `pluginRules`:

```ts
pluginRules: {
  'pluginName/ruleId': 'off' | 'warn' | 'error' | ['warn', options],
}
```

#### Custom Plugin Example

```ts
// sample-plugin.ts
import type { PickierPlugin, RuleContext } from 'pickier'

export const samplePlugin: PickierPlugin = {
  name: 'sample',
  rules: {
    'no-todo': {
      meta: { docs: 'disallow TODO comments', recommended: true },
      check(content: string, ctx: RuleContext) {
        const issues = []
        const lines = content.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const col = lines[i].indexOf('TODO')
          if (col !== -1) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: col + 1,
              ruleId: 'sample/no-todo',
              message: 'Unexpected TODO comment.',
              severity: 'warning',
            })
          }
        }
        return issues
      },
    },
    'experimental-check': {
      meta: { wip: true },
      check() {
        // not implemented yet — WIP rules surface errors with a :wip-error suffix
        throw new Error('WIP rule')
      },
    },
  },
}
```

#### Register the Plugin in Your Config

```ts
// pickier.config.ts
import type { PickierConfig } from 'pickier'
import { samplePlugin } from './sample-plugin'

const config: PickierConfig = {
  plugins: [samplePlugin],
  pluginRules: {
    'sample/no-todo': 'warn',
    'sample/experimental-check': 'error',
  },
}

export default config
```

### Formatting Details

#### Semicolons

Controlled by `format.semi` (default `false`). When `true`, Pickier safely removes only stylistic semicolons:

- Preserves `for (init; test; update)` headers
- Removes duplicate trailing semicolons (e.g. `foo();;` -> `foo();`)
- Removes lines that are just empty statements (`;`)
- Keeps normal end-of-line semicolons otherwise (non-destructive)

#### Imports (TypeScript/JavaScript)

Groups and rewrites the top import block:

- Splits type-only specifiers into `import type { ... } from 'x'`
- Keeps default and namespace imports
- Removes unused named specifiers (only when they have no alias)
- Merges multiple imports from the same module

Sorting order:

- By kind: type imports, side-effect imports, value imports
- For modules: external before relative
- For specifiers: A-Z by identifier

Spacing:

- Ensures a single blank line between the import block and the rest of the file
- Respects `format.finalNewline` at EOF

#### Built-in Rules

- `noDebugger` — removes `debugger` statements when `--fix` is used
- `noConsole` — controls severity (turn off for libraries that allow console logs)

## Benchmarks

Measured on an Apple M3 Pro with Bun 1.4.2 and Node 26.10.0, against oxfmt 0.72.0, oxlint 1.87.0, Prettier 3.9.9, Biome 2.5.15 and ESLint 10.12.0. Formatters run in check mode. oxfmt, Prettier and Biome parse and reprint; Pickier's formatter is line-based, and for Markdown it normalizes whitespace and leaves code blocks verbatim. Each linter runs its own default rules. Methodology, every table and the commands to reproduce them are in [`bechmarks/README.md`](bechmarks/README.md).

### Markdown — mdn/content

14,706 `.md` files (57.9 MB) at a pinned commit, `--check` over `files/**/*.md`, timed with hyperfine. Both tools use all 11 cores unless limited.

| Tool | Mean ± σ | vs Pickier |
|------|---------:|-----------:|
| **Pickier** | **0.580 s ± 0.010 s** | 1.0x |
| Pickier (1 thread) | 0.820 s ± 0.021 s | 1.4x slower |
| oxfmt | 2.057 s ± 0.041 s | 3.5x slower |
| oxfmt (`--threads=1`) | 5.460 s ± 0.052 s | 9.4x slower |
| Prettier | 79.699 s ± 1.300 s | 137x slower |

### TypeScript formatting

| | Pickier | oxfmt | Biome | Prettier |
|---|--------:|------:|------:|---------:|
| Large file (1,279 lines), in memory | **397 µs** | 769 µs | 48.9 ms (stdin) | 17.9 ms |
| Large file, CLI | **17.0 ms** | 45.8 ms | 91.6 ms | 151 ms |
| All three fixtures, CLI | **49.4 ms** | 133 ms | 193 ms | 364 ms |

### Linting

The CLI lints TS/JS files with a native engine on every core, and reports exactly what its TypeScript rules report.

| | Pickier | oxlint | Biome | ESLint |
|---|--------:|-------:|------:|-------:|
| Large file (1,279 lines), CLI | **23.9 ms** | 44.7 ms | 79.1 ms | 359 ms |
| Whole project (299 files), one invocation | **34.7 ms** | 50.1 ms | 112 ms | 1.27 s |
| Lint + format, all three fixtures | **113 ms** | 261 ms (oxlint + oxfmt) | 194 ms | 1.02 s (+ Prettier) |

```bash
# reproduce locally
bun run --cwd packages/pickier build
cd bechmarks && bun install
bun run bench:markdown-corpus
bun run bench:format-comparison
bun run bench:lint
```

## Programmatic Usage

Call Pickier from code (Bun/Node) for custom tooling, editors, or pipelines.

```ts
import type { RunOptions } from 'pickier'
import { config, defaultConfig, run, runLint, runFormat, lintText } from 'pickier'

// Unified run
const exitCode = await run(['.'], {
  mode: 'lint',
  fix: true,
})

// Lint specific directories
const lintCode = await runLint(['src', 'tests'], {
  fix: true,
  dryRun: false,
  reporter: 'json',
  maxWarnings: 0,
})

// Format specific globs
const fmtCode = await runFormat(['src/**/*.ts'], {
  write: true,
})

// Lint a single string
const result = await lintText('const x = 1;;', {
  filePath: 'virtual.ts',
})

// Access loaded config (from pickier.config.ts or defaults)
console.log('loaded config:', config)
```

## Development

This repository contains Pickier's source under `packages/pickier`.

```bash
# install deps
bun i

# run tests (with coverage)
bun test --coverage

# build JS and type declarations
bun run -C packages/pickier build

# compile native binary for your platform
bun run -C packages/pickier compile

# compile all platform binaries
bun run -C packages/pickier compile:all
```

Try the CLI locally without publishing:

```bash
# run the TS entry directly
bun packages/pickier/bin/cli.ts --help

# lint the current directory
bun packages/pickier/bin/cli.ts .

# or the compiled native binary (after compile)
./packages/pickier/bin/pickier-<your-platform> .
```

## Testing

```bash
bun test
```

## Changelog

Please see our [releases](https://github.com/pickier/pickier/releases) page for more information on what has changed recently.

## Contributing

Please review the [Contributing Guide](https://github.com/stacksjs/contributing) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/pickier/pickier/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://stacksjs.com/discord)

## Postcardware

“Software that is free, but hopes for a postcard.” We love receiving postcards from around the world showing where `pickier` is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](../../contributors)

## License

The MIT License (MIT). Please see [LICENSE](LICENSE.md) for more information.

Made with 💙
