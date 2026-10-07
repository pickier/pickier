# Plugin System

Pickier can run plugin rules alongside built-ins. Configure via `plugins` and `pluginRules` in your config.

Example:

```ts
// pickier.config.ts (both bare and prefixed forms are accepted)
import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  /* ... */
  pluginRules: {
    'sort-objects': ['warn', { type: 'alphabetical', order: 'asc', ignoreCase: true }],
    'sort-named-imports': 'warn',
    'max-statements-per-line': ['warn', { max: 1 }],
    'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    'no-super-linear-backtracking': 'error',
    // legacy-prefixed forms also work:
    // 'pickier/sort-objects': 'warn',
    // 'style/max-statements-per-line': 'warn',
    // 'pickier/no-unused-vars': 'error',
    // 'regexp/no-super-linear-backtracking': 'error',
  },
}

export default config
```

Built-in plugins and rules (see the Rules section for details):

- `pickier`: [`no-unused-vars`](/rules/no-unused-vars), [`prefer-const`](/rules/prefer-const), [`sort-array-includes`](/rules/sort-array-includes), [`sort-classes`](/rules/sort-classes), [`sort-enums`](/rules/sort-enums), [`sort-exports`](/rules/sort-exports), [`sort-heritage-clauses`](/rules/sort-heritage-clauses), [`sort-imports`](/rules/sort-imports), [`sort-interfaces`](/rules/sort-interfaces), [`sort-keys`](/rules/sort-keys), [`sort-maps`](/rules/sort-maps), [`sort-named-imports`](/rules/pickier-sort-named-imports), [`sort-object-types`](/rules/sort-object-types), [`sort-objects`](/rules/pickier-sort-objects)
- `style`: [`max-statements-per-line`](/rules/style-max-statements-per-line)
- `regexp`: [`no-super-linear-backtracking`](/rules/regexp-no-super-linear-backtracking)

Authoring custom plugins is possible using `PickierPlugin`, `RuleModule`, and `RuleContext` types. Pass plugin objects via `plugins`.

## Rule reference and options

Below are the built-in rules and their options (as implemented in `packages/pickier/src/cli/run-lint.ts`).

### sort-objects ([/rules/sort-objects](/rules/sort-objects))

Ensures object literal properties are sorted. Detects basic object literal blocks on the right-hand side of assignments, returns, and similar.

Options: `{ type?: 'alphabetical' | 'line-length'; order?: 'asc' | 'desc'; ignoreCase?: boolean; partitionByNewLine?: boolean }`

```ts
pluginRules: {
  'sort-objects': ['warn', { type: 'alphabetical', order: 'asc', ignoreCase: true }],
}
```

### sort-imports ([/rules/sort-imports](/rules/sort-imports))

Flags when the leading import block is not in the canonical order that the formatter would produce. Use this to get lint-time feedback without running the formatter.

Options: none

### sort-named-imports ([/rules/sort-named-imports](/rules/sort-named-imports))

Ensures named specifiers within a single import statement are sorted. Can compare by name length.

Options: `{ type?: 'alphabetical' | 'line-length'; order?: 'asc' | 'desc'; ignoreCase?: boolean; ignoreAlias?: boolean }`

### sort-heritage-clauses ([/rules/sort-heritage-clauses](/rules/sort-heritage-clauses))

Sorts TypeScript `extends`/`implements` lists. Supports grouping via patterns.

Options: `{ type?: 'alphabetical' | 'natural' | 'line-length' | 'unsorted'; order?: 'asc' | 'desc'; ignoreCase?: boolean; groups?: Array<string | string[]>; customGroups?: Record<string, string | string[]> }`

Example:

```ts
pluginRules: {
  'pickier/sort-heritage-clauses': ['warn', {
    type: 'alphabetical',
    order: 'asc',
    groups: ['framework', 'domain', 'unknown'],
    customGroups: { framework: ['^React\.', '^Vue\b'] }
  }],
}
```

### sort-keys (ESLint-compatible subset) ([/rules/sort-keys](/rules/sort-keys))

Sorts object keys with options similar to ESLint’s `sort-keys` rule.

Options: `[order, { caseSensitive?: boolean; natural?: boolean; minKeys?: number; allowLineSeparatedGroups?: boolean; ignoreComputedKeys?: boolean }]`

### sort-exports ([/rules/sort-exports](/rules/sort-exports))

Sorts contiguous groups of export statements.

Options: `{ type?: 'alphabetical' | 'natural' | 'line-length' | 'unsorted'; order?: 'asc' | 'desc'; ignoreCase?: boolean; partitionByNewLine?: boolean }`

### style/max-statements-per-line ([/rules/style-max-statements-per-line](/rules/style-max-statements-per-line))

Limits the number of statements per line (heuristically counting semicolons outside strings and for-headers).

Options: `{ max?: number }`

### pickier/no-unused-vars ([/rules/no-unused-vars](/rules/no-unused-vars))

Flags variables and parameters that are declared but never used.

Options: `{ varsIgnorePattern?: string; argsIgnorePattern?: string }`

### regexp/no-super-linear-backtracking ([/rules/regexp-no-super-linear-backtracking](/rules/regexp-no-super-linear-backtracking))

Detects a few common regex anti-patterns that can cause catastrophic backtracking (heuristic).

Options: none

## Best practices

- Keep plugin severity to `warn` initially to avoid blocking merges while tuning
- Use ignore patterns like `^_` for unused variables/args to allow intentional unused placeholders
- Prefer natural/alphabetical sorts over line-length sorts for readability

## Writing a plugin

```ts
import type { LintIssue, PickierPlugin, RuleContext } from 'pickier'

export const myPlugin: PickierPlugin = {
  name: 'my',
  rules: {
    'no-todo-comments': {
      check: (text: string, ctx: RuleContext): LintIssue[] => {
        const out: LintIssue[] = []
        text.split(/\r?\n/).forEach((line, i) => {
          if (line.includes('TODO:'))
            out.push({ filePath: ctx.filePath, line: i + 1, column: 1, ruleId: 'my/no-todo-comments', message: 'Avoid TODO comments', severity: 'warning' })
        })
        return out
      },
    },
  },
}
```

Then add it in your config:

```ts
import { myPlugin } from './plugins/my'

export default {
  plugins: [myPlugin],
  pluginRules: { 'my/no-todo-comments': 'warn' },
}
```
