# style/consistent-list-newline

Enforce consistent newline usage within list-like constructs such as array literals, object literals, and named import/export specifier lists.

- **Plugin:** style
- **Default:** off
- **Auto-fix:** No

## Examples

### Bad

```ts
// Inconsistent: some items on the same line, some on new lines
const colors = ['red', 'green',
  'blue']

// Inconsistent object formatting
const user = { name: 'Alice', age: 30,
  role: 'admin' }

// Inconsistent import formatting
import { foo, bar,
  baz } from './utils'
```

### Good

```ts
// All items on a single line (inline style)
const colors = ['red', 'green', 'blue']

// All items on separate lines (wrapped style)
const colors = [
  'red',
  'green',
  'blue',
]

// Consistent object formatting
const user = { name: 'Alice', age: 30, role: 'admin' }

const user = {
  name: 'Alice',
  age: 30,
  role: 'admin',
}

// Consistent import formatting
import { foo, bar, baz } from './utils'

import {
  foo,
  bar,
  baz,
} from './utils'
```

## Details

This rule checks three types of delimited lists:

1. **Array literals** (`[...]`): All items should either be on a single line or each on its own line.
2. **Object literals** (`{...}`): All key-value pairs should either be inline or each on its own line. Control flow blocks (`if`, `for`, `while`, etc.), class bodies, function and arrow-function bodies, and braces holding statements or `;`-separated type members are excluded.
3. **Named imports/exports** (`import { ... }` / `export { ... }`): All specifiers should follow the same inline or wrapped style.

The rule tokenizes each list to match its opening and closing delimiters and split on its own commas only, ignoring commas nested inside inner arrays, objects, function calls or type arguments such as `Map<string, number>`. Brackets and commas in comments, strings, template text and regular expressions are never read as lists.

The first item sets the style. If it starts on a new line after the opening bracket, every item must start on its own line ("wrapped" style). If it shares the bracket's line, no item may start on a new line ("inline" style). Line breaks inside an item, such as a nested object or a multi-line call, do not count, so `['error', {\n  max: 1,\n}]` is inline.

## Auto-fix

This rule does not provide auto-fix. Manually adjust the formatting to use a consistent style within each list.

## Configuration

```ts
// pickier.config.ts
export default {
  pluginRules: {
    'style/consistent-list-newline': 'warn',  // 'off' | 'warn' | 'error'
  },
}
```
