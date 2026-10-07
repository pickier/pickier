# Import Management

Pickier parses the leading import block in TS/JS files and rewrites it to a canonical, readable layout. This minimizes merge conflicts and keeps import sections clean.

Scope:

- Only the contiguous block of imports at the very top of the file is considered (blank lines and comments at the top are allowed before imports)
- Works with value imports, type-only imports, and side-effect imports

Operations:

- remove unused simple named imports (aliases and all type imports are preserved)
- merge multiple imports from the same source
- keep default and namespace imports
- split and collect `import type { ... }`
- sort named specifiers alphabetically
- flip simple one-letter aliases (e.g., `import { X as Y }` becomes `{ Y as X }` when both are single letters) for a stable left-side key
- order modules and kinds deterministically

## Module ordering

1. Type-only imports
2. Side-effect imports (`import 'polyfill'`)
3. Value imports

Within type-only and value imports:

- external modules before relative paths
- for value imports from the same source, prefer the form order: default, namespace, then named

## Examples

### Basic cleanup

Before:

```ts
import { A, B, unused } from 'lib'
import { x, y, z } from './util'
function run() {
  console.log(B)
}
```

After:

```ts
import { A, B } from 'lib'
import { x, y, z } from './util'
function run() {
  console.log(B)
}
```

`unused` was removed because it was not referenced and had no alias.

### Merging and separating type imports

Before:

```ts
import type { T } from 'lib'
import { A, B } from 'lib'
```

After:

```ts
import type { T } from 'lib'
import { A, B } from 'lib'
```

### Default, namespace, and named

Before:

```ts
import { a, b, c } from 'pkg'
import Pkg, * as All from 'pkg'
```

After:

```ts
import Pkg, * as All from 'pkg'
import { a, b, c } from 'pkg'
```

### Side-effect imports

Side-effect imports are preserved and placed after type imports but before value imports.

```ts
import type { Types } from 'lib'
import { something } from './local'
import 'reflect-metadata'
```

### Simple alias flipping

Aliases where both sides are a single letter are flipped to normalize sorting by the left-side identifier.

Before:

```ts
import { Z as Name, X as Y } from 'lib'
```

After:

```ts
import { Z as Name, Y as X } from 'lib'
```

Only the simple single-letter case is flipped.

## Grouping and separation

If code follows the import block, the formatter ensures a trailing blank line after the last import for readability.

## Unused named imports policy

- Only simple named specifiers without an alias are candidates for removal
- Default imports, namespace imports, and named specifiers with `as` aliases are kept
- Type specifiers are always kept

This heuristic balances cleanliness with safety.

## Edge cases

- Multiple comment lines at the top are fine; imports begin when the first `import` is encountered
- Inline ESLint/TS directives in the import block are preserved
- Dynamic imports (`await import('x')`) are not affected (they are not `import` statements)

## Best practices

- Keep imports at the very top of the file
- Prefer explicit named imports over broad namespace imports unless needed
- Avoid aliasing unless necessary, which helps the sorter and readers
- Consider enabling [`sort-named-imports`](/rules/sort-named-imports) (lint) to alert when manual edits leave names unsorted

## Troubleshooting

- “My import didn’t move” — ensure the import is part of the leading contiguous block
- “A name was removed incorrectly” — ensure it wasn’t only present in a comment/string; the check looks for real references

## FAQ

Q: Does it sort side-effect imports too?

A: Side-effect imports maintain their source order relative to other side-effect imports, but they are grouped between type and value imports for consistency.
