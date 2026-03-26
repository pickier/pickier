# Linting Basics

Pickier’s linter is opinionated but lightweight. It focuses on practical checks and provides a plugin surface for additional rules.

## Core checks

- `noDebugger`(configurable severity): flags`debugger`statements and auto-fixes them when`--fix`is used

-`noConsole`(configurable severity): flags`console.*`usage

- Quote preference diagnostics (TS/JS): warns when string quotes do not match`format.quotes`- Indentation diagnostics (TS/JS): warns when indentation is not a multiple of`format.indent`or when tabs are used

Optional heuristics via`rules`:

- `noCondAssign`: flags assignments in the conditional segment of `if`, `while`, and `for`statements

-`noTemplateCurlyInString`: flags template literal syntax (`${...}`) in regular strings

- `noUnusedCapturingGroup`: flags regex literals with capturing groups that are not referenced (heuristic)

## Built-in plugin rules

Enable via `pluginRules`in your config. See the Rules pages for details and examples:

- [/rules/sort-objects](/rules/sort-objects)
- [/rules/sort-imports](/rules/sort-imports)
- [/rules/sort-named-imports](/rules/sort-named-imports)
- [/rules/sort-heritage-clauses](/rules/sort-heritage-clauses)
- [/rules/sort-keys](/rules/sort-keys)
- [/rules/sort-exports](/rules/sort-exports)
- [/rules/style-max-statements-per-line](/rules/style-max-statements-per-line)
- [/rules/no-unused-vars](/rules/no-unused-vars)
- [/rules/regexp-no-super-linear-backtracking](/rules/regexp-no-super-linear-backtracking)
- [/rules/prefer-const](/rules/prefer-const)
- [/rules/shell](/rules/shell) (21 shell script rules)

-`sort-objects`: object literal key ordering checks

- `sort-imports`: flags when the import block would be changed by the formatter
- `sort-named-imports`: named specifiers within a single import statement must be sorted
- `sort-heritage-clauses`: sorts TypeScript `extends`/`implements`-`sort-keys`: ESLint-like object key sort check
- `sort-exports`: sorts contiguous export groups
- `max-statements-per-line`: enforces at most N statements per line
- `no-unused-vars`: detects declared but unused variables/parameters (with ignore patterns)
- `no-super-linear-backtracking`: flags regex patterns that may catastrophically backtrack

See Advanced » Plugin System for options.

## Inline disables

You can suppress issues for the next line using either Pickier-style or ESLint-style prefixes:

```ts
// pickier-disable-next-line no-console, quotes
console.log("x")

// pickier-disable-next-line sort-objects
const obj = { b: 1, a: 2 }

// pickier-disable-next-line pickier/sort-objects
const obj2 = { y: 1, x: 2 }

// pickier-disable-next-line ts/no-require-imports
const fs = require('node:fs')
```Notes:

- When no rule list is provided, all rules for the next line are suppressed.
- Rule matching accepts both prefixed and bare IDs (e.g.,`sort-objects`or`pickier/sort-objects`).
- Block comment form is also supported: `/*pickier-disable-next-line no-console*/`.
- The `eslint-disable-next-line`prefix also works for compatibility.

## CLI usage```bash

# scan with stylish reporter (default)

pickier lint .

# auto-fix (removes debugger statements); then re-check issues

pickier lint src --fix

# simulate fixes without writing (logs a message per changed file when verbose)

pickier lint . --fix --dry-run --verbose

# fail when any warning is present

pickier lint . --max-warnings 0

# JSON reporter for CI

pickier lint . --reporter json > lint.json

# compact reporter (one-line per issue)

pickier lint . --reporter compact

```## Reporters

-`stylish`(default): grouped by file with colored severities
-`json`: machine-readable object with `errors`, `warnings`, and `issues`-`compact`: single line per issue (`path:line:col severity rule message`)

### Stylish example

```src/index.ts

error  12:3  no-debugger  Unexpected debugger statement.
warn   18:5  no-console   Unexpected console usage.```## Configuration

Excerpt:```ts
import type { PickierConfig } from 'pickier'

export default {
  rules: {
    noDebugger: 'error',
    noConsole: 'warn',
    // noCondAssign: 'warn',
    // noUnusedCapturingGroup: 'off',
  },
  pluginRules: {
    'pickier/no-unused-vars': ['error', { varsIgnorePattern: '^*', argsIgnorePattern: '^*' }],
    'style/max-statements-per-line': ['warn', { max: 1 }],
  },
} satisfies PickierConfig

```## Examples

### noDebugger with --fix

Before:```ts
function load() {
  return 42
}

```After`pickier lint . --fix`:

```ts

function load() {
  return 42
}

```### Quote and indent diagnostics

Given`quotes: 'single'`and`indent: 2`, the linter will warn on lines like:

```ts

const a = "hello"  // prefer single quotes
   doThing()       // tabs not allowed; indent must be multiple of 2 spaces

```## Best practices

- Start with`reporter: stylish`locally and`reporter: compact`in CI
- Set`--max-warnings 0`in CI to keep the bar high, while tuning rule severities in your config
- Use`_`prefixes (or project-specific patterns) with`pickier/no-unused-vars`to allow intentionally unused names
- Pair the linter with the formatter so code style is both enforced and auto-corrected where safe

## Troubleshooting

- “Why did a variable get flagged unused?” — ensure it’s referenced beyond its declaration; destructuring keys also count as names
- “Regex flagged for backtracking” — simplify overlapping`.*`/`.+` constructs or add anchors/limits
