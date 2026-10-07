# Usage

Pickier exposes two primary commands: `lint` and `format`. Both accept file globs and share several flags.

## Lint

Detects simple issues such as `debugger` statements and `console` usage. Optional checks include assignment-in-conditions and RegExp heuristics. Plugin rules can add sorting and style checks. See the Rules section for details on each rule.

```bash
# lint everything under src
pickier lint src

# auto-fix debugger statements; do not write changes, just simulate
pickier lint . --fix --dry-run

# set a warning threshold (non-zero exit when exceeded)
pickier lint "src/**/*.ts" --max-warnings 0

# output as JSON
pickier lint . --reporter json

# compact reporter (one-line per issue)
pickier lint . --reporter compact
```

Supported flags:

- `--fix`: apply auto-fixes (removes `debugger` lines)
- `--dry-run`: simulate fixes without writing
- `--max-warnings <n>`: fail if warnings exceed `n` (default `-1` disables)
- `--reporter <stylish|json|compact>`: output format
- `--config <path>`: path to `pickier` config file
- `--ignore-path <file>`: ignore file (gitignore-style)
- `--ext <exts>`: comma-separated extensions (defaults from config)
- `--cache`: enable cache (reserved)
- `--verbose`: verbose output

## Format

Normalizes whitespace quickly and consistently. For TS/JS, also applies quote style, indentation, and import management. Known JSON files are ordered deterministically.

```bash
# check formatting without modifying files (exit 1 if changes needed)
pickier format . --check

# write changes to disk
pickier format src --write

# limit to specific extensions
pickier format . --ext .ts,.js
```

Supported flags:

- `--write`: write changes to files
- `--check`: check without writing (non-zero exit if changes would be made)
- `--config <path>`: path to `pickier` config file
- `--ignore-path <file>`: ignore file (gitignore-style)
- `--ext <exts>`: comma-separated extensions
- `--verbose`: verbose output

## Globs

Both commands accept one or more globs. If a path without glob magic is passed, it is treated as a directory and expanded to `**/*`.

Examples:

```bash
pickier lint .
pickier format "src/**/*.{ts,tsx,js}"
```

Ignored paths come from your config `ignores`. When `--ext` is omitted, Pickier uses your config's `extensions` list (built-in defaults: `.ts,.js,.html,.css,.json,.jsonc,.md,.yaml,.yml,.stx`).
