# sort-keys

Requires object keys to be sorted. This is an ESLint-compatible subset with common options.

- Category: Plugin (built-in)
- Default: off

Options: `[order, { caseSensitive?: boolean; natural?: boolean; minKeys?: number; allowLineSeparatedGroups?: boolean; ignoreComputedKeys?: boolean }]`

Config:

```ts
pluginRules: {
  'sort-keys': ['warn', 'asc', { caseSensitive: true, minKeys: 2 }],
}
```

## Examples

Before:

```ts
const obj = { z: 1, a: 1 }
```

After:

```ts
const obj = { a: 1, z: 1 }
```

## Best practices

- Keep `minKeys` > 1 to avoid noise on small literals
- Consider `natural: true` when mixing numbered keys
- Prefer sorting only within semantically homogeneous objects; avoid forcing sort on configuration-like literals if it harms readability
