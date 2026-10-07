# Performance

Pickier is designed to deliver fast results on large repos by combining the Bun runtime, efficient file scanning, and lightweight text transforms.

## Execution model

- Runs on Bun for low startup overhead
- Uses `fast-glob` with sane defaults to scan files quickly
- Applies targeted string-based transforms instead of full AST parsing

## Where the speed comes from

- Minimizing I/O: only files that match the `--ext`/configured `extensions` are opened
- Zero AST reprint: indentation, quotes, and spacing are normalized via fast passes
- Batching work: the import block is processed as a slice rather than full-file AST traversal

## Practical tips

- Narrow your globs in developer workflows:

```bash
pickier format src/components --write
pickier lint "src/**/*.{ts,tsx}" --max-warnings 0
```

- Prefer `--check` for quick pre-commit validation; use `--write` in a dedicated `fix` script
- Use the config’s `ignores` to exclude generated folders (`dist`, `coverage`, etc.)

## Cost model

Formatting time is roughly linear in file size. Import management has additional overhead proportional to the number of import lines at the top of the file. JSON sorting cost is proportional to object size.

## What about caching?

The CLI exposes a `--cache` flag on `lint`, which is currently reserved. Use narrower globs and `ignores` for now to keep runs fast.

## CI considerations

- Prefer `format --check` to avoid writing in CI
- Use `--reporter compact` or `--reporter json` for `lint` depending on your logs/annotations needs
- Split jobs by path (e.g., `packages/*`) for parallel throughput

## Best practices

- Keep `extensions` scoped to what your repo actually uses
- Exclude heavy/generated folders at the config level
- Avoid running Pickier on huge binary blobs (it already filters by extension, but be mindful with globs)
