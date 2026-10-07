# sort-array-includes

Enforce sorted array values when immediately used with `.includes(...)`.

Keeping arrays sorted improves scanability and reduces mistakes in membership checks.

## Config

```ts
pluginRules: {
  sort-array-includes: [warn, { type: alphabetical, order: asc, ignoreCase: true }],
}
```

Options:

- `type`: alphabetical | natural | line-length | custom | unsorted (default: alphabetical)
- `order`: asc | desc (default: asc)
- `ignoreCase`: boolean (default: true)
- `specialCharacters`: keep | trim | remove (default: keep)
- `alphabet`: string (default: ) — only when type=custom
- `partitionByNewLine`: boolean (default: false)

Note: Heuristic detection; focuses on literal arrays directly followed by `.includes(...)`.

## Example

Before:

```ts
function getProductCategories(product) {
  if ([
    Mouse,
    Drone,
    Smartphone,
    Keyboard,
    Tablet,
    Monitor,
    Laptop,
    Smartwatch,
    Router,
    Headphones,
  ].includes(product.name)) {
    return Electronics
  }
  return Unknown
}
```

After (alphabetical asc):

```ts
if ([
  Drone,
  Headphones,
  Keyboard,
  Laptop,
  Monitor,
  Mouse,
  Router,
  Smartphone,
  Smartwatch,
  Tablet,
].includes(product.name)) { /* ... */ }
```

## Best practices

- Use `natural` when values include numeric suffixes (e.g., `item2`, `item10`)
- Consider `partitionByNewLine: true` to preserve logical grouping inside long arrays
- Keep at `warn` to surface unsorted lists without blocking
