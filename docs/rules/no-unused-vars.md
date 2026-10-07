# pickier/no-unused-vars

Reports variables and parameters that are declared/assigned but never used.

- Category: Plugin (built-in)
- Default: off

Options: `{ varsIgnorePattern?: string; argsIgnorePattern?: string }` (defaults `'^_'` for both)

Config (both forms accepted):

```ts
pluginRules: {
  'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
  // or
  'pickier/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
}
```

Examples:

```ts
const unused = 1 // flagged
function greet(_name: string) {} // ok, matches '^_'
```

## More examples

Destructuring:

```ts
const { used, unused } = api()
console.log(used)
// 'unused' is flagged unless ignored by pattern
```

Function parameters:

```ts
function run(used: number, _unused: number) {
  console.log(used)
}
```

## Best practices

- Start with `'warn'` to measure noise, then upgrade to `'error'`
- Use `^_` prefix for intentionally unused names
- Avoid overly broad ignore patterns; prefer targeted prefixes to keep signal high
- Consider separate configs for tests to allow common unused patterns (e.g., `_t` in table-driven tests)
