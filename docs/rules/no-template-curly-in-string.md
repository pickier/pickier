# noTemplateCurlyInString

Flags template literal placeholder syntax in regular strings.

- Category: Core
- Default: Not enabled (optional rule)

Behavior:

- Lint: reports template literal syntax (`${expression}`) found within regular (single or double quoted) strings
- This rule helps catch common mistakes where backticks should be used instead of quotes for template literals

Config:

```ts
rules: { noTemplateCurlyInString: 'warn' } // 'off' | 'warn' | 'error'
```

Example violations:

```ts
const name = "John"
const message = "Hello ${name}!" // Should use backticks: `Hello ${name}!`
const value = 42
const output = 'Value is ${value}' // Should use backticks: `Value is ${value}`
```

Correct usage:

```ts
const name = "John"
const message = `Hello ${name}!` // Correct template literal
const regularString = "This is just a string" // No template syntax
const escapedBrace = "This \\${is} escaped" // Escaped, won't be flagged
```

## Examples

Violation:

```ts
function greet(name: string) {
  return "Hello ${name}!" // Error: should use template literal
}
```

Fix:

```ts
function greet(name: string) {
  return `Hello ${name}!` // Correct
}
```

## Best practices

- Use template literals (backticks) when you need to interpolate variables
- Use regular strings when you have static content
- Keep this rule at `warn` during migration to avoid blocking builds
- Consider enabling this rule to catch copy-paste errors from template literals

## Implementation details

This rule uses regex pattern matching to:

1. Find quoted strings (single or double quotes)
2. Check for `${...}` patterns within those strings
3. Flag any matches as violations
4. Properly handle escaped braces that shouldn't be flagged
