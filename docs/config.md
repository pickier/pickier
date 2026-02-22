# Configuration

Pickier uses a `pickier.config.ts`file in your project root for configuration. TypeScript, JavaScript, and JSON formats are supported.

## Quick Start```ts

import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  verbose: false,
  ignores: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  lint: {
    extensions: ['ts', 'js', 'html', 'css', 'json', 'md'],
    reporter: 'stylish',
    maxWarnings: -1,
  },
  format: {
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one',
    indent: 2,
    quotes: 'single',
    semi: false,
  },
  rules: {
    noDebugger: 'error',
    noConsole: 'warn',
  },
}

export default config

```## Configuration Options

### Core Settings**verbose**: Enable detailed logging and error context (default:`false`)

```ts

verbose: true

```**ignores**: Glob patterns for files to skip (default: `['**/node_modules/**', '**/dist/**', '**/.git/**']`)

```ts

ignores: [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.test.ts',
  '**/*.bench.ts',
  '**/*.config.ts',
]

```### Linting**lint.extensions**: File extensions to lint (default:`['ts', 'js', 'tsx', 'jsx']`)**lint.reporter**: Output format - `'stylish'`, `'json'`, or `'compact'`(default:`'stylish'`)**lint.maxWarnings**: Maximum warnings before failing, `-1`to disable (default:`-1`)

```ts

lint: {
  extensions: ['ts', 'js', 'html', 'css', 'md'],
  reporter: 'stylish',
  maxWarnings: 0,
}

```### Formatting**format.trimTrailingWhitespace**: Remove trailing whitespace (default:`true`)**format.maxConsecutiveBlankLines**: Maximum consecutive blank lines (default: `1`)**format.finalNewline**: Final newline policy - `'one'`, `'two'`, or `'none'`(default:`'one'`)**format.indent**: Indentation size (default: `2`)**format.indentStyle**: Indentation type - `'spaces'`or`'tabs'`(default:`'spaces'`)**format.quotes**: Quote style - `'single'`or`'double'`(default:`'single'`)**format.semi**: Enforce semicolons - `false`removes unnecessary semicolons (default:`false`)

```ts

format: {
  trimTrailingWhitespace: true,
  maxConsecutiveBlankLines: 1,
  finalNewline: 'one',
  indent: 2,
  indentStyle: 'spaces',
  quotes: 'single',
  semi: false,
}

```### Rules

Built-in rules with severity levels:`'off'`, `'warn'`, or `'error'`

```ts

rules: {
  noDebugger: 'error',
  noConsole: 'error',
  noTemplateCurlyInString: 'error',
  noCondAssign: 'error',
}

```### Plugin Rules

Enable plugin rules with consistent naming:```ts
pluginRules: {
  'ts/prefer-const': 'error',
  'style/curly': 'error',
  'style/if-newline': 'error',
  'style/brace-style': 'error',
  'style/max-statements-per-line': 'error',
  'regexp/no-super-linear-backtracking': 'error',
  'regexp/no-unused-capturing-group': 'error',
  'pickier/no-unused-vars': 'error',
  'pickier/import-dedupe': 'error',
  'unused-imports/no-unused-vars': 'error',
  'perfectionist/sort-imports': 'error',
  'node/prefer-global/buffer': 'error',
  'node/prefer-global/process': 'error',
}
```### Tailwind CSS Class Ordering

Enable canonical Tailwind class ordering via the `tailwind` block. Setting `enabled: true` automatically activates `pickier/sort-tailwind-classes` at `warn` severity:

```ts
tailwind: {
  // Enable the sort-tailwind-classes rule at 'warn' severity
  enabled: true,
  // Path to tailwind.config.js/ts (reserved for future use)
  configPath: './tailwind.config.ts',
  // Extra utility function names to scan (e.g. custom wrappers around clsx)
  callees: ['myTw', 'styles'],
  // Extra HTML attribute names to scan
  attributes: ['wrapperClass'],
}
```

Or enable explicitly via `pluginRules` for direct severity control:

```ts
pluginRules: {
  'pickier/sort-tailwind-classes': 'warn',
}
```

See [sort-tailwind-classes rule docs](./rules/sort-tailwind-classes.md) for the full class group order, scanned patterns, and examples.

## Rule Aliasing

Pickier supports ESLint config aliases for compatibility:```ts
'antfu/curly' → 'style/curly'
'antfu/if-newline' → 'style/if-newline'
'antfu/no-top-level-await' → 'ts/no-top-level-await'

```## Disable Comments

ESLint-style disable comments work in Pickier:```ts
// Disable next line
// eslint-disable-next-line no-console
console.log('Allowed')

// Disable block
/_eslint-disable no-console_/
console.log('Allowed')
console.error('Also allowed')
/_eslint-enable no-console_/

// Pickier prefix also works
// pickier-disable-next-line no-console
```## JSON Configuration```json

{
  "verbose": false,
  "ignores": ["**/node_modules/**", "**/dist/**"],
  "lint": {
    "extensions": ["ts", "js"],
    "reporter": "stylish",
    "maxWarnings": -1
  },
  "format": {
    "trimTrailingWhitespace": true,
    "maxConsecutiveBlankLines": 1,
    "finalNewline": "one",
    "indent": 2,
    "quotes": "single",
    "semi": false
  },
  "rules": {
    "noDebugger": "error",
    "noConsole": "warn"
  }
}

```## Environment Variables

-`PICKIER_NO_AUTO_CONFIG=1`: Disable automatic config loading

- `PICKIER_TRACE=1`: Enable trace logging
- `PICKIER_FAIL_ON_WARNINGS=1`: Treat warnings as errors

## Complete Example

```ts

import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  verbose: true,

  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/test/fixtures/**',
    '**/*.test.ts',
    '**/*.bench.ts',
    '**/*.config.ts',
  ],

  lint: {
    extensions: ['ts', 'js', 'html', 'css', 'json', 'md'],
    reporter: 'stylish',
    maxWarnings: -1,
  },

  format: {
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one',
    indent: 2,
    quotes: 'single',
    semi: false,
  },

  rules: {
    noDebugger: 'error',
    noConsole: 'error',
    noTemplateCurlyInString: 'error',
    noCondAssign: 'error',
  },

  pluginRules: {
    'ts/prefer-const': 'error',
    'style/curly': 'error',
    'style/if-newline': 'error',
    'pickier/no-unused-vars': 'error',
    'unused-imports/no-unused-vars': 'error',
    'regexp/no-super-linear-backtracking': 'error',
    'perfectionist/sort-imports': 'error',
  },
}

export default config

```## ESLint Migration

Common ESLint rules map to Pickier equivalents:

| ESLint Rule | Pickier Equivalent |
|-------------|-------------------|
|`no-debugger`|`noDebugger`|
|`no-console`|`noConsole`|
|`no-cond-assign`|`noCondAssign`|
|`prefer-const`|`ts/prefer-const`|
|`curly`|`style/curly`|
|`no-unused-vars`|`unused-imports/no-unused-vars`|

## CLI Override

Use`--config <path>`to specify a config file:```bash
pickier run . --config custom.config.ts
```
