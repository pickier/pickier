# CLI Reference

Pickier provides a unified CLI for linting and formatting your codebase.

## Commands

### `pickier run [...globs]`

**Recommended unified command** for all operations.

Automatically detects or explicitly sets the operation mode.

**Options:**

- `--mode <auto|lint|format>` - Operation mode (default: `auto`)
  - `auto`: Automatically detects mode based on other flags
  - `lint`: Linting mode
  - `format`: Formatting mode
- `--fix` - Auto-fix linting problems (lint mode)
- `--dry-run` - Simulate fixes without writing files
- `--write` - Write formatted changes to files (format mode)
- `--check` - Check formatting without writing (format mode)
- `--max-warnings <n>` - Fail if warnings exceed threshold (default: `-1` disables)
- `--reporter <name>` - Output format: `stylish` | `json` | `compact` (default: `stylish`)
- `--config <path>` - Path to Pickier configuration file
- `--ignore-path <file>` - Ignore file path (gitignore-style patterns)
- `--ext <exts>` - Comma-separated file extensions (defaults to config)
- `--cache` - Enable caching (reserved for future use)
- `--verbose` - Enable verbose output with detailed error context

**Examples:**

```bash
# Auto-detect mode
pickier run .

# Explicit lint mode with auto-fix
pickier run . --mode lint --fix

# Format with write
pickier run src --mode format --write

# Lint specific files with JSON output
pickier run "src/**/*.ts" --mode lint --reporter json

# Check formatting without modifying files
pickier run . --mode format --check

# Lint with maximum 10 warnings allowed
pickier run . --mode lint --max-warnings 10
```

### `pickier lint [...globs]`

**Legacy command** - use `pickier run --mode lint` instead.

Lint files and report issues.

**Options:**

- `--fix` - Automatically fix problems
- `--dry-run` - Simulate fixes without writing
- `--max-warnings <n>` - Fail if warnings exceed threshold (default: `-1`)
- `--reporter <name>` - `stylish` | `json` | `compact` (default: `stylish`)
- `--config <path>` - Path to Pickier config
- `--ignore-path <file>` - Ignore file (gitignore-style)
- `--ext <exts>` - Comma-separated extensions
- `--cache` - Enable cache (reserved)
- `--verbose` - Verbose output

**Examples:**

```bash
pickier lint . --dry-run
pickier lint src --fix
pickier lint "src/**/*.ts" --reporter json
pickier lint . --max-warnings 0  # Fail on any warning
```

### `pickier format [...globs]`

**Legacy command** - use `pickier run --mode format` instead.

Format files according to style rules.

**Options:**

- `--write` - Write changes to files
- `--check` - Check formatting without writing
- `--config <path>` - Path to Pickier config
- `--ignore-path <file>` - Ignore file (gitignore-style)
- `--ext <exts>` - Comma-separated extensions
- `--verbose` - Verbose output

**Examples:**

```bash
pickier format . --check
pickier format src --write
pickier format "**/*.{ts,js}" --write
```

### `pickier version`

Display the current Pickier version.

```bash
pickier version
```

### `pickier` (no command)

Display help information with available commands and options.

```bash
pickier
pickier --help
```

## File Extensions

When `--ext` is omitted, Pickier uses `lint.extensions` or `format.extensions` from your configuration file.

**Built-in defaults:**

- TypeScript: `.ts`, `.tsx`
- JavaScript: `.js`, `.jsx`
- Markup: `.html`
- Styling: `.css`
- Data: `.json`, `.jsonc`
- Documentation: `.md`
- Configuration: `.yaml`, `.yml`
- Custom: `.stx`

**Custom extensions:**

```bash
# Lint only TypeScript files
pickier run . --ext ts,tsx --mode lint

# Format JavaScript and JSON files
pickier run . --ext js,json --mode format --write
```

## Exit Codes

Pickier uses standard exit codes to indicate results:

- `0` - Success (no errors, warnings within threshold)
- `1` - Failure (errors found, or warnings exceed threshold)
- `2` - Configuration or runtime error

## Reporters

### Stylish Reporter

Human-readable output with colors and formatting (default).

```bash
pickier run . --reporter stylish
```

**Output example:**

```
/path/to/file.ts
  1:1  error  Unexpected debugger statement  noDebugger
  5:3  warn   Unexpected console statement   noConsole

1 problem (1 error, 1 warning)
```

### JSON Reporter

Machine-readable JSON format for tooling integration.

```bash
pickier run . --reporter json
```

**Output example:**

```json
{
  "errors": 1,
  "warnings": 1,
  "issues": [
    {
      "filePath": "/path/to/file.ts",
      "line": 1,
      "column": 1,
      "ruleId": "noDebugger",
      "message": "Unexpected debugger statement",
      "severity": "error"
    }
  ]
}
```

### Compact Reporter

Condensed single-line format for quick scanning.

```bash
pickier run . --reporter compact
```

**Output example:**

```
/path/to/file.ts: line 1, col 1, error - Unexpected debugger statement (noDebugger)
```

## Glob Patterns

Pickier supports standard glob patterns for file matching:

```bash
# All files recursively
pickier run .

# Specific directory
pickier run src

# Pattern matching
pickier run "src/**/*.ts"

# Multiple patterns
pickier run "src/**/*.ts" "tests/**/*.test.ts"

# Negation (exclude)
pickier run "src/**/*.ts" "!src/**/*.test.ts"
```

## Environment Variables

Control Pickier behavior with environment variables:

- `PICKIER_NO_AUTO_CONFIG=1` - Disable automatic config loading
- `PICKIER_TRACE=1` - Enable verbose trace logging
- `PICKIER_TIMEOUT_MS=<ms>` - Glob operation timeout (default: 8000)
- `PICKIER_RULE_TIMEOUT_MS=<ms>` - Individual rule timeout (default: 5000)
- `PICKIER_FAIL_ON_WARNINGS=1` - Treat all warnings as errors
- `PICKIER_CONCURRENCY=<n>` - Parallel processing limit (default: 8)

**Example:**

```bash
# Enable trace logging
PICKIER_TRACE=1 pickier run .

# Treat warnings as errors
PICKIER_FAIL_ON_WARNINGS=1 pickier run . --mode lint

# Increase concurrency
PICKIER_CONCURRENCY=16 pickier run . --mode lint
```

## Configuration File

Pickier automatically searches for configuration files in your project root:

- `pickier.config.ts` (recommended)
- `pickier.config.js`
- `pickier.config.json`

Override with `--config`:

```bash
pickier run . --config custom-config.ts
```

See [Configuration](/config) for full configuration options.

## Ignore Files

Pickier respects ignore patterns from:

1. Configuration file `ignores` array
2. Custom ignore file via `--ignore-path`
3. `.gitignore` patterns (when no custom ignore specified)

**Example ignore file:**

```
# Ignore node modules
node_modules/

# Ignore build outputs
dist/
build/

# Ignore specific files
*.test.ts
*.config.ts
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Lint code
  run: bunx pickier run . --mode lint --reporter compact

- name: Check formatting
  run: bunx pickier run . --mode format --check
```

### GitLab CI

```yaml
lint:
  script:
    - bunx pickier run . --mode lint --reporter json
```

### Pre-commit Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "bunx pickier run . --mode lint --fix"
    }
  }
}
```

## Performance Tips

1. **Use specific globs** instead of scanning entire directories
2. **Configure ignores** to skip unnecessary files
3. **Adjust concurrency** for your CPU cores
4. **Enable caching** when available (future feature)
5. **Use `--dry-run`** for quick validation without writing

## Troubleshooting

### Pickier not finding config

Ensure config file is in project root or use `--config` to specify path.

### Slow performance

Check ignore patterns and reduce glob scope. Adjust `PICKIER_CONCURRENCY`.

### Rule timeout errors

Increase timeout with `PICKIER_RULE_TIMEOUT_MS=10000` for complex files.

### Memory issues on large repos

Process directories separately or increase Node/Bun memory limit.
