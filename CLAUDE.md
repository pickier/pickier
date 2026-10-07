# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Pickier is a fast linter and formatter built with Bun, designed to provide instant feedback with minimal configuration. It combines linting, formatting, import organization, and markdown linting in a single tool with an ESLint-style plugin system.

## Commands

### Development

```bash
# Install everything deps.yaml and package.json list (Bun, Zig, packages)
pantry install

# Run tests (with coverage)
bun test

# Run specific test suites
bun run test:core     # Core functionality tests
bun run test:format   # Formatting tests
bun run test:lint     # Linting tests
bun run test:rules    # All rule tests
bun run test:plugin   # Plugin system tests
bun run test:watch    # Watch mode

# Build the package
bun run -C packages/pickier build

# Build all packages
bun run build

# Compile standalone binaries
bun run -C packages/pickier compile       # Current platform
bun run -C packages/pickier compile:all   # All platforms

# Type checking
bun --bun tsc --noEmit
```

### Testing Locally

```bash
# Run the TypeScript CLI directly (fastest for development)
bun packages/pickier/bin/cli.ts run . --mode lint

# Run the built JavaScript CLI
bun packages/pickier/dist/bin/cli.js run . --mode lint

# Run the compiled standalone binary (after compiling)
./packages/pickier/bin/pickier-<platform> run . --mode lint
```

### Using Pickier

```bash
# Unified command (preferred)
pickier run . --mode lint --fix
pickier run . --mode format --write

# Shorthand commands
pickier lint . --fix
pickier format . --write
```

## Architecture

### Core Components

1. **Unified Entry Point (`src/run.ts`)**
   - Single entry point that routes to either lint or format mode
   - `runUnified()` handles mode detection and delegates to the linter
   - Formatting is implemented as "linting with fixes applied"

2. **Linter (`src/linter.ts`)**
   - `runLint()`: Main CLI linting workflow with file globbing, scanning, fixing, and reporting
   - `runLintProgrammatic()`: Programmatic API that returns structured results
   - `lintText()`: Lint a single string with optional cancellation support
   - `scanContent()`: Core scanning logic for built-in rules (quotes, indent, debugger, console, etc.)
   - `applyPlugins()`: Executes plugin rules with timeout protection and error handling
   - `applyPluginFixes()`: Iteratively applies rule fixers from plugins
   - `parseDisableDirectives()`: Parses ESLint-style disable comments (disable-next-line, disable/enable blocks)
   - `isSuppressed()`: Checks if a rule is suppressed for a given line

3. **Formatter (`src/formatter.ts`)**
   - Legacy module, mostly superseded by unified linting
   - `applyFixes()`: Applies built-in fixes (debugger removal) + plugin fixes + global formatting
   - `formatStylish()`: Formats lint issues in ESLint-style output

4. **Format Engine (`src/format.ts`)**
   - `formatCode()`: Core formatting logic for whitespace, quotes, indentation, semicolons, and imports
   - Import organization: splits type/value imports, sorts modules/specifiers, removes unused imports
   - Whitespace: trim trailing, limit consecutive blank lines, ensure final newline(s)
   - Semicolon removal: safely removes stylistic semicolons while preserving for-loop headers
   - Quote normalization: enforces single/double quotes in code (respects JSON double-quote requirement)
   - Shell formatting: `processShellLinesFused()` normalizes indentation for shell control structures (`if`/`then`/`fi`, `case`/`esac`, `while`/`for`/`do`/`done`, function bodies), preserving heredoc content verbatim

5. **Plugin System (`src/plugins/`)**
   - **Core plugins**: `pickier`, `style`, `regexp`, `ts`, `markdown`, `shell`, `publint`
   - Each plugin exports a `PickierPlugin` with `name` and `rules` Record
   - Rules implement the `RuleModule` interface: `check(content, context) => LintIssue[]` and optional `fix(content, context) => string`
   - Configured via `pluginRules` in config, supporting both full IDs (`plugin/rule`) and bare rule names
   - Rules can be marked as WIP (`meta.wip = true`) to surface implementation errors early
   - Plugins are loaded via `getAllPlugins()`, which returns all core plugins

6. **Configuration (`src/config.ts`)**
   - Uses `bunfig` to load `pickier.config.ts` from the project root
   - Exports `defaultConfig` and the loaded `config`
   - Config includes `ignores`, `lint`, `format`, `rules`, `plugins`, and `pluginRules`

7. **AST Utilities (`src/ast.ts`)**
   - Lightweight TypeScript parsing utilities for plugin rules
   - Used by import/sort rules to understand code structure

### Testing

Tests are organized by functionality:

- `test/core/`: Core functionality tests
- `test/format/`: Formatting behavior tests
- `test/lint/`: Linting workflow tests
- `test/rules/`: Rule-specific tests (sort, style, markdown, shell, imports, typescript, regexp)
- `test/plugin/`: Plugin system tests
- `test/fixtures/`: Sample files for testing

All tests use Bun's test runner. `PICKIER_NO_AUTO_CONFIG=1` is set for you by `packages/pickier/test/preload.ts` (wired up in both `bunfig.toml` files), so the suite never picks up the repo's own `.config/pickier.ts` — that config narrows `lint.extensions` and re-tunes severities, and a test that loaded it would fail for reasons unrelated to the code under test. Both `bun test` and `bun run test` work, from the repo root or from `packages/pickier`.

### Environment Variables

- `PICKIER_NO_AUTO_CONFIG=1`: Disable automatic config loading (used in tests)
- `PICKIER_TRACE=1`: Enable verbose trace logging
- `PICKIER_TIMEOUT_MS`: Glob timeout in milliseconds (default: 8000)
- `PICKIER_RULE_TIMEOUT_MS`: Individual rule timeout in milliseconds (default: 5000)
- `PICKIER_FAIL_ON_WARNINGS=1`: Treat warnings as errors in exit code
- `PICKIER_WORKERS`: Worker threads for a CLI run over many files (default: one per core above 32 files; `0` keeps everything on the main thread)
- `PICKIER_NATIVE=0`: Lint TS/JS on the TypeScript path only, without the native engine
- `PICKIER_NATIVE_BINARY`: Path to a native engine to use instead of the shipped one

### Native Lint Engine

The CLI lints TS/JS files with a Zig engine (`packages/zig/src/native/`, run as `pickier-native lint-batch`) on every core. It reports exactly what the TypeScript rules report. `src/native.ts` decides per run what it takes:

- **Ported rules:** the built-in checks and every rule in `NATIVE_RULES` run natively.
- **Other rules:** TypeScript runs them on the same files, and the two sets of issues are merged in plan order.
- **TypeScript only:** `--fix`, formatting, files the engine declines, and an engine that cannot start or speaks another protocol version.

- A rule joins `NATIVE_RULES` only once `packages/zig/scripts/parity.ts` reports no differences for it (`bun scripts/parity.ts <dirs> --rule <id>`).
- Changing a ported TypeScript rule means changing its Zig port too; CI's `native` job checks every ported rule.
- Build the shipped engines with `bun run -C packages/pickier build:native`, or for this machine only with `bun scripts/build-native.ts --host`. Both need Zig 0.16+.

### Key Design Patterns

1. **Plugin rules are isolated**: Each rule runs independently with timeout protection. If a rule throws, it's captured as an internal error rather than crashing the entire lint run.

2. **Disable directives**: ESLint-style comments are supported:
   - `// eslint-disable-next-line rule1, rule2`
   - `/* eslint-disable rule1 */` ... `/* eslint-enable rule1 */`
   - `pickier-` can be used instead of `eslint-`
   - Bare rule IDs and plugin-prefixed IDs both match, either way round

3. **Fixer iteration**: Plugin fixers run up to 5 passes until no changes are detected, allowing rules to compose fixes.

4. **Programmatic API**: `runLint()` for the CLI, `runLintProgrammatic()` for programmatic use with structured output, `lintText()` for single-string linting.

5. **Fast globbing fallbacks**: Fast paths for single files and simple directory patterns before falling back to glob.

## Monorepo Structure

- `packages/pickier/`: Main linter/formatter package
- `packages/zig/`: Zig port and the native lint engine
- `packages/vscode/`: VS Code extension (separate package)
- Workspace root has shared dev dependencies and git hooks

## Code Style

- Use Bun's native TypeScript support
- Follow existing conventions: 2-space indentation, single quotes, no semicolons (unless required)
- Core rules (`noDebugger`, `noConsole`) are built-in; plugin rules extend functionality
- Prefer async/await over callbacks
- Use trace logging (`trace(...)`) for debugging, controlled by `PICKIER_TRACE=1`

## Important Notes

- The CLI supports `pickier run --mode auto`, `pickier run --mode lint`, or `pickier run --mode format` as well as `pickier lint` and `pickier format` as shorthand commands
- When adding new rules, implement both `check` and `fix` (if applicable) in the appropriate plugin
- Rule IDs follow the `plugin/rule-name` convention, but config also supports bare rule names for convenience
- Tests run with `PICKIER_NO_AUTO_CONFIG=1` (set automatically by the test preload) so the project config is never loaded

---

## Linting

- Use **pickier** for linting — never use eslint directly
- Run `bunx --bun pickier .` to lint, `bunx --bun pickier . --fix` to auto-fix
- When fixing unused variable warnings, prefer `// eslint-disable-next-line` comments over prefixing with `_`

## Frontend

- Use **stx** for templating — never write vanilla JS (`var`, `document.*`, `window.*`) in stx templates
- Use **crosswind** as the default CSS framework which enables standard Tailwind-like utility classes
- stx `<script>` tags should only contain stx-compatible code (signals, composables, directives)

## Dependencies

- **pantry** installs the toolchain and packages, locally and in CI: `deps.yaml` lists Bun and Zig, and `pantry install` sets up everything
- **buddy-bot** handles dependency updates — not renovatebot
- **better-dx** provides shared dev tooling as peer dependencies — do not install its peers (e.g., `typescript`, `pickier`, `bun-plugin-dtsx`) separately if `better-dx` is already in `package.json`
- If `better-dx` is in `package.json`, ensure `bunfig.toml` includes `linker = "hoisted"`
