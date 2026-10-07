# noCondAssign

Flags assignments used in conditional expressions (`if`, `while`, `for` condition segment).

- Category: Core (optional)
- Default: off

Config:

```ts
rules: { noCondAssign: 'warn' } // 'off' | 'warn' | 'error'
```

Example:

```ts
if (x = compute()) {
  // ...
}
```

Rationale: assignments in conditions are often mistakes; prefer explicit comparisons.

## Non-violations

- Assignments outside of condition parentheses are not flagged:

```ts
let x
x = compute()
if (x) {
  // ok
}
```

- Comparisons in conditions are fine:

```ts
if (x === compute()) {
  // ok
}
```

## Best practices

- Prefer explicit comparisons (`===`, `!==`) in conditions
- If you intentionally assign and test in one expression, make it obvious and consider disabling the rule locally with a comment for that line
- Split complex conditions across lines; readability reduces accidental assignments
- Consider extracting the computed value before the condition: `const v = compute(); if (v) { ... }`

## Troubleshooting

- “It flagged a `for` loop” — the rule only checks the condition segment of `for (init; condition; update)` and will report `=` found in the middle segment
