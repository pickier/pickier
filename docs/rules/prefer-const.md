# prefer-const

Suggest `const` for variables that are initialized and never reassigned.

- **Rule ID**: `prefer-const` (also accepted as `pickier/prefer-const` in config)
- **Severity**: configurable via `pluginRules`
- **Options**: none

## Description

When a variable is declared with `let` or `var`, initialized on the same line, and never reassigned, this rule suggests using `const` instead. Destructuring declarations are skipped to avoid false positives.

This is a heuristic rule implemented in the built-in plugin. It scans lines for simple declarations and then looks for reassignments or `++`/`--` usage later in the file.

## Examples

Code that triggers the rule:

```ts
const count = 1
function inc() {
  console.log(count)
}
```

Suggested change:

```ts
const count = 1
function inc() {
  console.log(count)
}
```

Code that does not trigger the rule:

```ts
let total = 0
for (const n of [1, 2, 3])
  total += n // reassigned
```

## Configuration

Enable the rule via `pluginRules` in your `pickier` config:

```ts
// pickier.config.ts
export default {
  pluginRules: {
    'prefer-const': 'error',
    // or: 'pickier/prefer-const': 'error'
  },
}
```

This rule is implemented in the built-in plugin inside the linter, alongside other sorting and style checks.
