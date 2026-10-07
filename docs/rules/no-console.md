# noConsole

Flags `console.*` usage.

- Category: Core
- Default: `warn`

Config:

```ts
rules: { noConsole: 'warn' } // 'off' | 'warn' | 'error'
```

Example:

```ts
console.log('debug')
```

Tip: Use a project logger or wrap console calls behind an environment check.

## Examples

Violation:

```ts
console.warn('deprecated')
```

Not a violation (rule off):

```ts
// pickier.config.*
export default { rules: { noConsole: 'off' } }
```

## Best practices

- Consider allowing `console.error` in CLI tools while warning on other calls
- Wrap logging behind a utility to centralize behavior and enable silencing in production
- Keep the rule at `warn` during adoption to avoid blocking merges
- Use environment flags to silence logs in production builds
- In libraries, forward logs to consumer-provided hooks instead of writing directly

## Troubleshooting

- “I need logs in tests” — turn the rule off in test-specific configs or filter allowed methods in a follow-up custom plugin
