# noDebugger

Flags `debugger` statements.

- Category: Core
- Default: `error`

Behavior:

- Lint: reports each `debugger` line with configured severity
- Lint with `--fix`: removes lines containing only `debugger` statements

Config:

```ts
rules: { noDebugger: 'error' } // 'off' | 'warn' | 'error'
```

Example:

```ts
debugger
```

Fix (`--fix`): line is removed.

## Examples

Violation and autofix:

```ts
function work() {
  debugger
  doStuff()
}
```

After `pickier lint . --fix`:

```ts
function work() {
  doStuff()
}
```

## Best practices

- Keep severity at `error` to prevent shipping `debugger`
- Use `--fix` locally before committing
- Add a pre-commit hook to run `pickier lint --fix` to automatically remove stray `debugger` lines
