# ts/no-require-imports

Disallow `require()` in TypeScript files. Prefer ESM `import` syntax.

- Category: Plugin (built-in)
- Default: off

Config (both forms accepted):

```ts
pluginRules: { 'no-require-imports': 'error' }
// or
pluginRules: { 'ts/no-require-imports': 'error' }
```

Examples (violations):

```ts
// a.ts
const fs = require('node:fs')
```

```ts
// a.ts
import fs = require('fs')
```

Non-violations:

```ts
// dynamic import
const mod = await import('node:fs')
```

Rationale: TypeScript projects commonly target ESM. Mixing `require()` with ESM import/export leads to interop edge cases and bundler inconsistencies.

## Best practices

- Use `import fs from 'fs'` or `import * as fs from 'fs'` depending on module type
- Enable this rule at `error` for ESM-only codebases
- If migrating legacy CJS, selectively disable the rule per-file during transition
