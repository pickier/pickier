# pickier

Format, lint, and more in a fraction of a second.

## Installation

```bash
bun add -D pickier
```

```bash
npm install -D pickier
```

## Usage

```bash
# Lint files
pickier lint . --fix

# Format files
pickier format . --write

# Unified command
pickier run . --mode lint --fix
pickier run . --mode format --write
```

### Programmatic API

```typescript
import { lintText, runLintProgrammatic } from 'pickier'

// Lint a single string
const issues = await lintText('const x = "hello";')

// Programmatic lint run
const results = await runLintProgrammatic({
  files: ['src/**/*.ts'],
  fix: true,
})
```

## Features

- **Fast CLI** - Instant feedback powered by Bun
- **Lint and Format** - One tool for both linting and formatting
- **Zero-config Defaults** - Works out of the box, or customize with `pickier.config.ts`
- **Import Organization** - Splits type/value imports, sorts modules and specifiers, removes unused imports
- **JSON Sorting** - Sorts `package.json`, `tsconfig.json`, and other config files
- **Tailwind CSS Class Ordering** - Enforces canonical class order across HTML/JSX/TSX/Vue/Svelte/STX
- **Markdown Linting** - Documentation quality checks with auto-fix support
- **Shell Script Linting & Formatting** - 21 rules for `.sh`, `.bash`, and `.zsh` files with auto-fix support and indentation normalization
- **Spell Checking** - Optional spell-check rules powered by [ts-spell-check](https://github.com/stacksjs/ts-spell-check) (234K dictionary, 150+ common misspelling corrections)
- **Flexible Formatting** - Configurable indent, quotes, semicolons, whitespace, and more
- **Package.json Validation** - Validates exports ordering, file format, and module system
- **ESLint-style Plugin System** - Load plugins, enable/disable rules
- **CI-friendly Reporters** - Stylish, compact, and JSON output formats
- **Programmatic API** - Use in custom tooling and editor integrations

## Shell Script Support

Pickier includes a full `shell/` plugin with 21 rules for linting and formatting shell scripts (`.sh`, `.bash`, `.zsh`). Files are also detected by shebang (`#!/bin/bash`, `#!/usr/bin/env zsh`, etc.).

### Formatting

Shell formatting normalizes indentation for control structures (`if/then/fi`, `case/esac`, `while/for/do/done`, function bodies), trims trailing whitespace, collapses blank lines, and ensures final newlines — all while preserving heredoc content verbatim.

### Rules

**Error Prevention:**

| Rule | Fixable | Description |
|------|---------|-------------|
| `shell/command-substitution` | Yes | Use `$()` instead of backticks |
| `shell/quote-variables` | - | Quote `$var` to prevent word splitting |
| `shell/no-cd-without-check` | - | Require `\|\| exit` after `cd` |
| `shell/no-eval` | - | Disallow `eval` |
| `shell/no-useless-cat` | - | Detect useless use of cat |
| `shell/no-ls-parsing` | - | Don't parse `ls` output |
| `shell/no-variable-in-single-quotes` | - | Flag `$var` inside single quotes |
| `shell/no-exit-in-subshell` | - | Flag `exit` inside subshells |

**Style:**

| Rule | Fixable | Description |
|------|---------|-------------|
| `shell/shebang` | - | Ensure proper shebang line |
| `shell/indent` | Yes | Consistent indentation (2 spaces default) |
| `shell/function-style` | Yes | Prefer `name() {` over `function name` |
| `shell/operator-spacing` | Yes | Spaces inside `[[ ]]` and `[ ]` |
| `shell/keyword-spacing` | - | Spacing around shell keywords |
| `shell/no-trailing-semicolons` | Yes | Remove unnecessary trailing `;` |
| `shell/no-trailing-whitespace` | Yes | Trim trailing whitespace |

**Best Practices:**

| Rule | Fixable | Description |
|------|---------|-------------|
| `shell/prefer-double-brackets` | Yes | `[[ ]]` over `[ ]` for bash/zsh |
| `shell/set-options` | - | Recommend `set -euo pipefail` |
| `shell/prefer-printf` | - | `printf` over `echo -e`/`echo -n` |
| `shell/consistent-case-terminators` | - | Consistent `;;` in case statements |
| `shell/no-broken-redirect` | - | Correct `2>&1` ordering |
| `shell/heredoc-indent` | - | Recommend `<<-` for indented heredocs |

## License

MIT
