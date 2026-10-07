# Globbing & Ignores

Accurate and fast scanning is essential for performance. Pickier uses `fast-glob` and applies a consistent path expansion strategy, then filters by extensions.

## Path expansion

- If a provided argument contains glob magic (e.g., `*`, `{}`, `[]`, `?`), it is passed through as-is
- If it looks like a file path with an extension, it is used as-is (lint only)
- Otherwise, it is treated as a directory and expanded to `dir/**/*`

Note: The formatter expands directories to `**/*` unconditionally for non-glob inputs; the linter uses a slightly smarter check to leave explicit file paths untouched.

## Extension filtering

After expansion, matched files are filtered by extensions:

- CLI default for `--ext` is `.ts,.tsx,.js,.jsx`
- If `--ext` is omitted, Pickier uses the config’s `format.extensions` or `lint.extensions`
- In config, extensions are specified without dots (e.g., `'ts'`, not `'.ts'`)

Examples:

```bash
pickier format . --ext .ts,.tsx,.js
pickier lint "src/**/*.{ts,tsx,js}" --max-warnings 0
```

## Ignores

Ignored paths come from `config.ignores`. Defaults include common folders like `node_modules`, `dist`, `build`, `vendor`, and `coverage`.

Examples:

```ts
export default {
  ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
}
```

Currently, the `--ignore-path` CLI flag is accepted but not applied; prefer configuring `ignores` in your config file.

## fast-glob options

Pickier calls `fast-glob` with these options:

- `dot: false` — skip dotfiles by default
- `ignore: config.ignores`
- `onlyFiles: true`
- `unique: true`
- `absolute: true`

## Best practices

- Keep `ignores` broad at the top-level to save I/O (e.g., `**/coverage/**`)
- Pass explicit globs in local workflows for the changed area to save time
- Remember to include `.json`, `.md`, `.yaml`, `.yml` if you want formatting coverage beyond TS/JS
