# regexp/no-super-linear-backtracking

Heuristically flags regex literals that may cause super-linear (catastrophic) backtracking.

- Category: Plugin (built-in)
- Default: off

Config (both forms accepted):

```ts
pluginRules: { 'no-super-linear-backtracking': 'error' }
// or
pluginRules: { 'regexp/no-super-linear-backtracking': 'error' }
```

Patterns flagged include:

- Adjacent unlimited quantifiers that can exchange characters (e.g., `.*\s*`, `\s*.*`, `.+?\s*`)
- Repeated unlimited wildcards (e.g., `.*.*`)
- Nested unlimited quantifiers (e.g., `(.+)+`)

Example:

```ts
const r = /(.*)(.*)/ // flagged
```

## Safer alternatives

- Use specific character classes and limits: `([\w-]+)\s+([\w-]+)`
- Avoid overlapping unlimited quantifiers. Where necessary, add anchors or make quantifiers reluctant with bounded context.

## Best practices

- Keep this rule at `error` in performance-sensitive code (routers, parsers)
- Add tests for worst-case regex inputs to catch regressions
- Prefer explicit tokenization over complex single-shot regexes when performance is critical
