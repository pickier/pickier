# sort-exports

Sorts contiguous groups of export statements.

- Category: Plugin (built-in)
- Default: off

Options: `{ type?: 'alphabetical' | 'natural' | 'line-length' | 'unsorted'; order?: 'asc' | 'desc'; ignoreCase?: boolean; partitionByNewLine?: boolean }`

Config:

```ts
pluginRules: {
  'sort-exports': ['warn', { type: 'alphabetical', order: 'asc' }],
}
```

## Examples

Before:

```ts
export const z = 1
export const a = 2
```

After:

```ts
export const a = 2
export const z = 1
```

## Best practices

- Keep related exports grouped and separated by blank lines; the rule respects contiguous groups
- Export constants/types first, then functions, then classes for clarity (project convention)
