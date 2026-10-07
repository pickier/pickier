# Disable Comments

Pickier supports ESLint-style disable comments to suppress rules inline without modifying your configuration.

## Syntax Options

You can use either `eslint-` or `pickier-` prefix for all disable directives.

## Disable Next Line

Disable rules for the immediately following line of code.

```typescript
// eslint-disable-next-line rule1, rule2
const x = debugger // debugger allowed here

// pickier-disable-next-line no-console
console.log('Allowed') // console allowed here

// Multiple rules
// eslint-disable-next-line noDebugger, noConsole
console.log(debugger) // Both allowed
```

**Syntax:**
- `// eslint-disable-next-line rule1, rule2`
- `// pickier-disable-next-line rule1, rule2`

**Rules:**
- Rules are comma-separated
- Whitespace around commas is ignored
- Both bare rule IDs and plugin-prefixed IDs work

## Disable All Rules (Next Line)

Disable all rules for the next line by omitting the rule list.

```typescript
// eslint-disable-next-line
const x = debugger // All rules disabled

// pickier-disable-next-line
console.log(eval('code')) // All rules disabled
```

## Block Disable/Enable

Disable rules for a range of lines using block comments.

```typescript
/* eslint-disable noDebugger, noConsole */
debugger
console.log('test')
/* eslint-enable noDebugger, noConsole */

// Or with pickier prefix
/* pickier-disable style/curly, ts/prefer-const */
if (true) x = 1
/* pickier-enable style/curly, ts/prefer-const */
```

**Features:**
- Works across multiple lines
- Can be nested
- Supports multiple rules
- Must use `/* */` block comment syntax

## Inline Disable/Enable

Use single-line comments to disable rules for the rest of the file or until re-enabled.

```typescript
// eslint-disable noConsole
console.log('Allowed from here')
console.log('Still allowed')
// eslint-enable noConsole
console.log('Not allowed') // Will trigger warning

// pickier-disable style/curly
if (true) x = 1 // Allowed
if (false) y = 2 // Allowed
// pickier-enable style/curly
if (test) z = 3 // Will require curly braces
```

## File-Level Disable

Disable rules for the entire file by placing directive on line 1.

```typescript
/* eslint-disable */
// All rules disabled for entire file
debugger
console.log('anything goes')
```

Or disable specific rules:

```typescript
/* eslint-disable noDebugger, noConsole */
// Only these two rules disabled for entire file
debugger
console.log('test')
```

## Rule ID Formats

Disable comments support multiple rule ID formats:

### Bare Rule IDs

```typescript
// eslint-disable-next-line noDebugger
// eslint-disable-next-line no-console
```

### Plugin-Prefixed IDs

```typescript
// eslint-disable-next-line style/curly
// eslint-disable-next-line ts/prefer-const
// eslint-disable-next-line regexp/no-super-linear-backtracking
```

### ESLint Compatibility

```typescript
// eslint-disable-next-line eslint/no-unused-vars
// Works with 'eslint/' prefix for compatibility
```

### Multiple Formats Mixed

```typescript
// eslint-disable-next-line noDebugger, style/curly, ts/prefer-const
// All formats can be mixed in same directive
```

## Examples

### Disable Debugger for Development

```typescript
function debug() {
  // eslint-disable-next-line noDebugger
  debugger // OK during development
}
```

### Disable Console in Scripts

```typescript
/* eslint-disable noConsole */
// CLI script - console output is intentional
console.log('Starting process...')
console.log('Complete')
/* eslint-enable noConsole */
```

### Temporary Style Exception

```typescript
// eslint-disable-next-line style/curly
if (isDev) return console.log('Dev mode')

// Normal code resumes
if (isProd) {
  return startProduction()
}
```

### Legacy Code Migration

```typescript
/* eslint-disable ts/no-explicit-any, quality/no-var */
// Legacy code section being migrated
var data: any = getLegacyData()
/* eslint-enable ts/no-explicit-any, quality/no-var */

// New code follows best practices
const typedData: UserData = getNewData()
```

### Disable All in Test Fixture

```typescript
/* eslint-disable */
// Test fixture - intentionally problematic code
export const badCode = `
  debugger
  console.log('test')
  var x = 1
`
```

## Implementation Details

### Binary Search Optimization

Pickier uses binary search to efficiently match disable directives to code lines, making disable comments fast even in large files.

### Comment Line Tracking

Disable directives are tracked separately from code, so they don't interfere with line number reporting.

### Precedence

More specific disables take precedence over broader ones:

1. Next-line disable (highest precedence)
2. Block disable/enable ranges
3. Inline disable/enable
4. File-level disable

### Suppression Map

Internally, Pickier maintains a suppression map tracking:
- Next-line suppressions
- Range-based suppressions (disable/enable blocks)
- File-level suppressions

This allows O(1) or O(log n) lookup when checking if a rule is suppressed.

## Best Practices

### Use Sparingly

Disable comments should be the exception, not the rule. Prefer fixing issues over suppressing them.

```typescript
// Bad - hiding the problem
// eslint-disable-next-line noDebugger
debugger

// Good - fix the problem
// Remove debugger before commit
```

### Be Specific

Disable only the rules you need, not all rules.

```typescript
// Bad - too broad
// eslint-disable-next-line
console.log('test')

// Good - specific
// eslint-disable-next-line noConsole
console.log('test')
```

### Add Context

Explain why you're disabling a rule.

```typescript
// Console output intentional for CLI tool
// eslint-disable-next-line noConsole
console.log(result)

// Debugger needed for complex async debugging
// eslint-disable-next-line noDebugger
debugger
```

### Limit Scope

Use the smallest scope possible.

```typescript
// Bad - disables for entire file
/* eslint-disable noConsole */
console.log('one line')
// ... rest of file

// Good - disable only what's needed
// eslint-disable-next-line noConsole
console.log('one line')
```

### Re-enable Promptly

When using block disable, re-enable as soon as possible.

```typescript
// Bad - never re-enabled
/* eslint-disable noConsole */
console.log('test')
// ... many lines later

// Good - re-enable immediately
/* eslint-disable noConsole */
console.log('test')
/* eslint-enable noConsole */
```

## Troubleshooting

### Directive Not Working

**Check syntax:**
- Must be on separate line before code
- Correct comment syntax (`//` or `/* */`)
- No typos in rule IDs

**Check rule ID:**
```typescript
// Wrong - no spaces in rule IDs
// eslint-disable-next-line no Debugger

// Wrong - incorrect rule name
// eslint-disable-next-line debugger

// Correct
// eslint-disable-next-line noDebugger
```

### Multiple Line Disable Not Working

Use block comments, not single-line:

```typescript
// Wrong - single line comment
// eslint-disable noConsole
console.log('test')
// eslint-enable noConsole

// Correct - block comment or inline comment
/* eslint-disable noConsole */
console.log('test')
/* eslint-enable noConsole */
```

### Rule Still Firing

Verify you're using the correct rule ID:

```typescript
// Check the error message for the exact rule ID
// Error: "Unexpected console call (noConsole)"

// Use the exact rule ID from error
// eslint-disable-next-line noConsole
console.log('test')
```

## See Also

- [Configuration](/config) - Configure rules globally
- [Rules Overview](/rules/overview) - All available rules
- [CLI Reference](/cli) - Command-line options
