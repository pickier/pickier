# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Pickier is a fast linter and formatter built with Bun, designed to provide instant feedback with minimal configuration. It combines linting, formatting, import organization, and markdown linting in a single tool with an ESLint-style plugin system.

## Commands

### Development

```bash

# Install dependencies

bun i

# Run tests (with coverage)

bun test

# Run specific test suites

bun test:core          # Core functionality tests
bun test:format        # Formatting tests
bun test:lint          # Linting tests
bun test:rules         # All rule tests
bun test:plugin        # Plugin system tests
bun test:watch         # Watch mode

# Build the package

bun run -C packages/pickier build

# Build all packages

bun run build

# Compile native binaries

bun run -C packages/pickier compile        # Current platform
bun run -C packages/pickier compile:all    # All platforms

# Type checking

bun --bun tsc --noEmit
```### Testing Locally```bash

# Run the TypeScript CLI directly (fastest for development)

bun packages/pickier/bin/cli.ts run . --mode lint

# Run the built JavaScript CLI

bun packages/pickier/dist/bin/cli.js run . --mode lint

# Run the compiled native binary (after compiling)

./packages/pickier/bin/pickier-<platform> run . --mode lint

```### Using Pickier```bash

# Unified command (preferred)

pickier run . --mode lint --fix
pickier run . --mode format --write

# Legacy commands (deprecated, will be removed)

pickier lint . --fix
pickier format . --write
```

## Architecture

### Core Components

1.**Unified Entry Point (`src/run.ts`)**- Single entry point that routes to either lint or format mode

   - `runUnified()` function handles mode detection and delegates to linter
   - Formatting is now implemented as "linting with fixes applied"

2.**Linter (`src/linter.ts`)**- `runLint()`: Main CLI linting workflow with file globbing, scanning, fixing, and reporting

   - `runLintProgrammatic()`: Programmatic API that returns structured results
   - `lintText()`: Lint a single string with optional cancellation support
   - `scanContent()`: Core scanning logic for built-in rules (quotes, indent, debugger, console, etc.)
   - `applyPlugins()`: Executes plugin rules with timeout protection and error handling
   - `applyPluginFixes()`: Iteratively applies rule fixers from plugins
   - `parseDisableDirectives()`: Parses ESLint-style disable comments (disable-next-line, disable/enable blocks)
   - `isSuppressed()`: Checks if a rule is suppressed for a given line

3.**Formatter (`src/formatter.ts`)**- Legacy module, mostly deprecated in favor of unified linting

   - `applyFixes()`: Applies built-in fixes (debugger removal) + plugin fixes + global formatting
   - `formatStylish()`: Formats lint issues in ESLint-style output

4.**Format Engine (`src/format.ts`)**- `formatCode()`: Core formatting logic for whitespace, quotes, indentation, semicolons, and imports

   - Import organization: splits type/value imports, sorts modules/specifiers, removes unused imports
   - Whitespace: trim trailing, limit consecutive blank lines, ensure final newline(s)
   - Semicolon removal: safely removes stylistic semicolons while preserving for-loop headers
   - Quote normalization: enforces single/double quotes in code (respects JSON double-quote requirement)

5.**Plugin System (`src/plugins/`)**-**Core Plugins**: `pickier`, `style`, `regexp`, `ts`, `markdown`, `publint`- Each plugin exports a`PickierPlugin`with`name`and`rules`Record

   - Rules implement`RuleModule`interface:`check(content, context) => LintIssue[]`and optional`fix(content, context) => string`- Configuration via`pluginRules` in config, supporting both full IDs (`plugin/rule`) and bare rule names
   - Rules can be marked as WIP (`meta.wip = true`) to surface implementation errors early
   - Plugins are loaded via `getAllPlugins()` which returns all core plugins

6.**Configuration (`src/config.ts`)**- Uses `bunfig`to load`pickier.config.ts`from project root

   - Exports`defaultConfig`and loaded`config`- Config includes`ignores`, `lint`, `format`, `rules`, `plugins`, and `pluginRules`

7.**AST Utilities (`src/ast.ts`)**- Lightweight TypeScript parsing utilities for plugin rules

   - Used by import/sort rules to understand code structure

### Testing

Tests are organized by functionality:

- `test/core/`: Core functionality tests
- `test/format/`: Formatting behavior tests
- `test/lint/`: Linting workflow tests
- `test/rules/`: Rule-specific tests (sort, style, markdown, imports, typescript, regexp)
- `test/plugin/`: Plugin system tests
- `test/fixtures/`: Sample files for testing

All tests use Bun's test runner. Set `PICKIER_NO_AUTO_CONFIG=1`to disable auto-loading config during tests.

### Environment Variables

-`PICKIER_NO_AUTO_CONFIG=1`: Disable automatic config loading (used in tests)

- `PICKIER_TRACE=1`: Enable verbose trace logging
- `PICKIER_TIMEOUT_MS`: Glob timeout in milliseconds (default: 8000)
- `PICKIER_RULE_TIMEOUT_MS`: Individual rule timeout in milliseconds (default: 5000)
- `PICKIER_FAIL_ON_WARNINGS=1`: Treat warnings as errors in exit code

### Key Design Patterns

1.**Plugin Rules are Isolated**: Each rule runs independently with timeout protection. If a rule throws, it's captured as an internal error rather than crashing the entire lint run.

2.**Disable Directives**: Supports ESLint-style comments:

   - `// eslint-disable-next-line rule1, rule2`-`/_eslint-disable rule1_/`...`/_eslint-enable rule1_/`- Can use`pickier-`prefix instead of`eslint-`- Supports bare rule IDs and plugin-prefixed IDs

3.**Fixer Iteration**: Plugin fixers run up to 5 passes until no changes are detected, allowing rules to compose fixes.

4.**Programmatic API**:`runLint()`for CLI,`runLintProgrammatic()`for programmatic use with structured output,`lintText()`for single-string linting.

5.**Fast Globbing Fallbacks**: Implements fast-path strategies for single files and simple directory patterns before falling back to tinyglobby.

## Monorepo Structure

-`packages/pickier/`: Main linter/formatter package

- `packages/vscode/`: VS Code extension (separate package)
- Workspace root has shared dev dependencies and git hooks

## Code Style

- Use Bun's native TypeScript support
- Follow existing conventions: 2-space indentation, single quotes, no semicolons (unless required)
- Core rules (`noDebugger`, `noConsole`) are built-in; plugin rules extend functionality
- Prefer async/await over callbacks
- Use trace logging (`trace(...)`) for debugging, controlled by `PICKIER_TRACE=1`## Important Notes

- The CLI has been unified around`pickier run --mode <auto|lint|format>`; the old `pickier lint`and`pickier format`commands are deprecated
- When adding new rules, implement both`check`and`fix`(if applicable) in the appropriate plugin
- Rule IDs follow`plugin/rule-name`convention but config also supports bare rule names for convenience
- All globbing uses`tinyglobby`for consistency and speed
- Tests must set`PICKIER_NO_AUTO_CONFIG=1` to avoid loading project config
