# sort-objects

Requires object literal properties to be sorted. Detects simple object literals on the right-hand side of assignments, returns, etc. Supports grouping by blank lines.

- Category: Plugin (built-in)
- Default: off

Options: `{ type?: 'alphabetical' | 'line-length'; order?: 'asc' | 'desc'; ignoreCase?: boolean; partitionByNewLine?: boolean }`

Config:

```ts
pluginRules: {
  'sort-objects': ['warn', { type: 'alphabetical', order: 'asc', ignoreCase: true }],
}
```

Example:

```ts
const user = {
  z: 1,
  a: 2,
}
```

Report: keys should be in ascending order.

## More examples

Partition groups by blank lines (when `partitionByNewLine: true`):

```ts
const data = {
  b: 1,
  a: 1,

  y: 2,
  x: 2,
}
```

Reports two groups out of order.

## Best practices

- Prefer alphabetical ASC with `ignoreCase: true` to minimize diffs
- Use the formatter’s JSON sorting for config files instead of this rule
- Partition by blank lines when grouping semantically distinct fields
- Avoid mixing spread and explicit keys within a sortable group; place spreads at group boundaries
