# style/max-statements-per-line

Limits the number of statements allowed on a single line. Useful to discourage minified or hard-to-read one-liners.

- Category: Plugin (built-in)
- Default: off

Options: `{ max?: number }` (default `1`)

Config (both forms accepted):

```ts
pluginRules: {
  'max-statements-per-line': ['warn', { max: 1 }],
  // or
  'style/max-statements-per-line': ['warn', { max: 1 }],
}
```

Example:

```ts
const a = 1; const b = 2 // two statements on one line
```

Report: with `{ max: 1 }`, the second statement should be on a new line.

## Best practices

- Keep `{ max: 1 }` for readability; increase only if your team prefers compact style in specific files (e.g., config scripts)
- Pair with the formatter so semicolon normalization is consistent
- Apply selectively to sources where readability is paramount; relax in generated or compact utility scripts
