# sort-heritage-clauses

Sorts TypeScript `extends` / `implements` lists with support for custom grouping.

- Category: Plugin (built-in)
- Default: off

Options: `{ type?: 'alphabetical' | 'natural' | 'line-length' | 'unsorted'; order?: 'asc' | 'desc'; ignoreCase?: boolean; groups?: Array<string | string[]>; customGroups?: Record<string, string | string[]> }`

Config (both forms accepted):

```ts
pluginRules: {
  'sort-heritage-clauses': ['warn', {
    type: 'alphabetical', order: 'asc',
    groups: ['framework', 'domain', 'unknown'],
    customGroups: { framework: ['^React\\.', '^Vue\\b'] },
  }],
  // or
  'pickier/sort-heritage-clauses': ['warn', { /* same options */ }],
}
```

## Examples

Before:

```ts
interface I extends Z, A, B {}
class C implements Zoo, App, Bar {}
```

After (alphabetical ASC):

```ts
interface I extends A, B, Z {}
class C implements App, Bar, Zoo {}
```

## Best practices

- Use `groups`/`customGroups` to keep framework/base classes first
- Prefer `alphabetical` for predictable diffs
- Use `natural` sort when names include numeric suffixes (e.g., `Foo2`, `Foo10`)
