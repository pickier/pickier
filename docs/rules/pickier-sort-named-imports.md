# sort-named-imports

Ensures named specifiers within a single import statement are sorted. Can compare alphabetically or by line length.

- Category: Plugin (built-in)
- Default: off

Options: `{ type?: 'alphabetical' | 'line-length'; order?: 'asc' | 'desc'; ignoreCase?: boolean; ignoreAlias?: boolean }`

Config (both forms accepted):

```ts
pluginRules: { 'sort-named-imports': ['warn', { type: 'alphabetical' }] }
// or
pluginRules: { 'pickier/sort-named-imports': ['warn', { type: 'alphabetical' }] }
```

## Examples

Before:

```ts
import { a, m, z } from 'x'
```

After:

```ts
import { a, m, z } from 'x'
```

## Best practices

- Use `ignoreAlias: true` if you frequently alias names and want sorting by the alias instead
- Keep `type` and value specifiers separate when possible for clarity
- Prefer consistent casing and naming across modules to maximize sorting stability
