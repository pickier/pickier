# sort-interfaces

Enforce sorted TypeScript interface properties.

Sorting interface properties provides a clear and predictable structure, improving readability and maintenance. Property comments and documentation remain adjacent to their properties when sorted by this rule.

## Config

```ts
pluginRules: {
  sort-interfaces: [warn, { type: alphabetical, order: asc, ignoreCase: true }],
}
```

Options:

- `type`: alphabetical | natural | line-length | custom | unsorted (default: alphabetical)
- `order`: asc | desc (default: asc)
- `ignoreCase`: boolean (default: true)
- `specialCharacters`: keep | trim | remove (default: keep)
- `alphabet`: string (default: ) — only when type=custom
- `partitionByNewLine`: boolean (default: false)
- `sortBy`: name | value (default: name) — sort by property names or by their value types

Note: Heuristic detection focusing on single-line property and method signatures.

## Example

Before:

```ts
interface User {
  firstName: string
  email: string
  roles: string[]
  login: string
  phoneNumber?: string
  address: Address
  id: string
}
```

After (alphabetical asc):

```ts
interface User {
  address: Address
  email: string
  firstName: string
  id: string
  login: string
  phoneNumber?: string
  roles: string[]
}
```

## Best practices

- Prefer `natural` when keys include numbers (e.g., `field2`, `field10`)
- Use `partitionByNewLine: true` to preserve logical grouping (e.g., identification vs. metadata)
- Consider `sortBy: value` to group by type when helpful (e.g., all `string` fields together)
- Avoid combining with adjacent-overload-signatures rules to prevent conflicts
