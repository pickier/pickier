# sort-maps

Enforce sorted elements within JavaScript `Map([...])`.

Sorting map entries provides a predictable structure and makes lookups easier to scan during review.

## Config

```ts
pluginRules: {
  sort-maps: [warn, { type: alphabetical, order: asc, ignoreCase: true }],
}
```

Options:

- `type`: alphabetical | natural | line-length | custom | unsorted (default: alphabetical)
- `order`: asc | desc (default: asc)
- `ignoreCase`: boolean (default: true)
- `specialCharacters`: keep | trim | remove (default: keep)
- `alphabet`: string (default: )
- `partitionByNewLine`: boolean (default: false)

Note: Heuristic detection; focuses on literal `new Map([...])` expressions.

## Example

Before:

```ts
const products = new Map([
  [monitor, { name: Monitor, price: 200 }],
  [laptop, { name: Laptop, price: 1000 }],
  [mouse, { name: Mouse, price: 25 }],
  [keyboard, { name: Keyboard, price: 50 }],
])
```

After (alphabetical asc by key):

```ts
const products = new Map([
  [keyboard, { name: Keyboard, price: 50 }],
  [laptop, { name: Laptop, price: 1000 }],
  [monitor, { name: Monitor, price: 200 }],
  [mouse, { name: Mouse, price: 25 }],
])
```

## Best practices

- Prefer `natural` when keys have numeric suffixes
- Use `partitionByNewLine: true` to preserve intent in large maps with grouped entries
- Keep at `warn` initially; escalate to `error` when the team is comfortable
