# sort-object-types

Enforce sorted object types.

Standardizing the order of members within object types enhances readability without affecting behavior.

## Config

```ts
pluginRules: {
  sort-object-types: [warn, { type: alphabetical, order: asc, ignoreCase: true }],
}
```

Options:

- `type`: alphabetical | natural | line-length | custom | unsorted (default: alphabetical)
- `order`: asc | desc (default: asc)
- `ignoreCase`: boolean (default: true)
- `specialCharacters`: keep | trim | remove (default: keep)
- `alphabet`: string (default: ) — only when type=custom
- `partitionByNewLine`: boolean (default: false)
- `sortBy`: name | value (default: name)

Note: Heuristic parsing; focuses on single-line members.

## Example

Before:

```ts
interface Company {
  ceo: string
  departments: Department[]
  headquarters: string
  name: string
  industry: string
  founded: Date
}
```

After (alphabetical asc by name):

```ts
interface Company {
  ceo: string
  departments: Department[]
  founded: Date
  headquarters: string
  industry: string
  name: string
}
```

## Best practices

- Prefer `natural` when keys contain numbers
- Use `partitionByNewLine: true` to maintain logical groupings
- Consider `sortBy: value` to group by property types when beneficial
