# Configuration Deep Dive

Key fields:

- `format.indentStyle`, `format.indent`, `format.quotes`, `format.semi`, `format.finalNewline`
- `format.extensions` / `lint.extensions`: list of extensions (without dots)
- `ignores`: glob patterns excluded from scanning

CLI vs config precedence:

- `--ext` from the CLI takes precedence; when omitted, the CLI uses `.ts,.tsx,.js,.jsx` by default
- Otherwise, Pickier uses `*.extensions` from your config

Import management is always applied to TS/JS files during formatting; JSON sorting is applied to known files (`package.json`, `tsconfig*.json`).

## Loading order

Pickier uses `bunfig` to resolve and merge configuration:

- `defaultConfig` (built-in) is exported for reference
- `config` is the runtime-loaded configuration (your overrides merged on top)

You can import both:

```ts
import { defaultConfig, config as runtimeConfig } from 'pickier'
```

## Extensions shape

In the config file, extensions are specified without leading dots:

```ts
format: { extensions: ['ts', 'js', 'json', 'md'] }
```

The CLI `--ext` uses dot-prefixed values:

```bash
pickier format . --ext .ts,.tsx,.js
```

## Indentation style

Pickier supports both spaces and tabs for TS/JS files:

```ts
format: {
  indentStyle: 'spaces', // or 'tabs'
  indent: 2, // for 'spaces', this is spaces per level; for 'tabs', visual width used by diagnostics
}
```

For `indentStyle: 'tabs'`, leading indentation must be tabs (no mixing spaces). For `indentStyle: 'spaces'`, leading indentation must be a multiple of `indent` spaces (no tabs).

## Rules and plugins

Core rules:

```ts
rules: {
  noDebugger: 'error',
  noConsole: 'warn',
  // optional heuristics
  // noUnusedCapturingGroup: 'warn',
  // noCondAssign: 'error',
}
```

Plugin configuration:

```ts
plugins: [/* PickierPlugin objects or strings (string form not auto-loaded at runtime) */],
pluginRules: {
  'pickier/sort-objects': ['warn', { type: 'alphabetical', order: 'asc' }],
  'style/max-statements-per-line': ['warn', { max: 1 }],
}
```

Note: string plugin entries are not dynamically imported by the linter at runtime; pass actual plugin objects.

## Ignoring files

Prefer configuring ignores in `ignores` rather than relying on `--ignore-path` (the flag is currently accepted but ignored by the CLI).

```ts
ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/coverage/**']
```

## Best practices

- Keep your config small; rely on the defaults when possible
- Use `pluginRules` in `warn` level first to gauge noise, then tighten to `error` where appropriate
- Pin `extensions` to the set of files you actually lint/format to reduce I/O
- Store the config at the repo root to enable easy CLI invocation
