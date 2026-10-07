# sort-enums

Enforce sorted TypeScript enum members.

Keeping enum members in a consistent and predictable order improves readability and maintainability.

## Config

```ts
pluginRules: {
  sort-enums: [warn, { type: alphabetical, order: asc, ignoreCase: true }],
}
```

Options:

- `type`: alphabetical | natural | line-length | custom | unsorted (default: alphabetical)
- `order`: asc | desc (default: asc)
- `ignoreCase`: boolean (default: true)
- `specialCharacters`: keep | trim | remove (default: keep)
- `alphabet`: string (default: ) — only when type=custom
- `partitionByNewLine`: boolean (default: false)
- `sortByValue`: boolean (default: false) — sort by enum values (names by default)
- `forceNumericSort`: boolean (default: false) — numeric enums sorted numerically regardless of type/order

Note: This is a heuristic rule; it does not parse full TypeScript syntax trees.

## Example

Before:

```ts
enum Priority {
  Critical = Critical,
  None = None,
  Low = Low,
  High = High,
  Medium = Medium,
}
```

After (alphabetical asc by name):

```ts
enum Priority {
  Critical = Critical,
  High = High,
  Low = Low,
  Medium = Medium,
  None = None,
}
```

## Best practices

- Use `natural` when enum member names include numeric suffixes
- Enable `sortByValue` when values matter more than names (e.g., localized strings)
- Use `partitionByNewLine: true` to keep logical groups intact
- Pair with code review expectations for enum organization (e.g., status enums grouped by lifecycle)
