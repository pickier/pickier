# sort-imports

Flags when the leading import block is not in the canonical order the formatter would produce.

- Category: Plugin (built-in)
- Default: off

Options: none

Config (both forms accepted):

```ts
pluginRules: { 'sort-imports': 'warn' }
// or
pluginRules: { 'pickier/sort-imports': 'warn' }
```

See Features » Import Management for the canonical import ordering.

## Examples

Before:

```ts
import type { T } from 'lib'
import { A, B } from 'lib'
import { a, b, c } from './x'
```

After:

```ts
import type { T } from 'lib'
import { A, B } from 'lib'
import { a, b, c } from './x'
```

## Best practices

- Pair with the formatter to auto-apply canonical import order
- Keep imports at the top of files so the rule/formatter can analyze them
- Group external and relative modules separately to improve readability
- Avoid mixing value and type imports in one statement; separate for clarity
