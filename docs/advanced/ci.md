# CI Usage

Exit codes:

- `format --check`: exits 1 if changes are needed
- `lint`: exits 1 if any errors, or if warnings exceed `maxWarnings`

Examples:

```bash
pickier format . --check
pickier lint . --max-warnings 0 --reporter compact
```

## GitHub Actions

[pantry](https://github.com/pantry-pm/pantry) sets up the whole job in one step: it installs what your `deps.yaml` lists (Bun, and anything else your project needs) and your `package.json` dependencies, and caches both between runs.

```yaml
# deps.yaml
dependencies:
  bun.sh: ^1.4.2
```

```yaml
# .github/workflows/pickier.yml
name: Pickier
on: [push, pull_request]
jobs:
  pickier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pantry-pm/pantry/packages/action@v0.11.74
      - name: Format (check)
        run: bunx pickier format . --check
      - name: Lint
        run: bunx pickier lint . --max-warnings 0 --reporter compact
```

On TS/JS files the CLI uses its native lint engine on every core, so a whole project usually lints in well under a second. For very large repositories, `--cache` keeps each file's results and only lints files whose content changed:

```yaml
      - uses: actions/cache@v5
        with:
          path: .pickiercache
          key: pickier-${{ github.sha }}
          restore-keys: pickier-
      - name: Lint
        run: bunx pickier lint . --cache --max-warnings 0
```

The cache is only reused by a run with the same Pickier version, config and options, so a stale entry is never reported.

## Pre-commit hook

```bash
#!/usr/bin/env bash
set -euo pipefail

changed=$(git diff --name-only --cached | tr '\n' ' ')
if [ -n "$changed" ]; then
  bunx pickier format $changed --check | cat
  bunx pickier lint $changed --max-warnings 0 --reporter compact | cat
fi
```

## JSON reporter in CI

For machine-readable lint results:

```bash
bunx pickier lint . --reporter json > pickier-lint.json
```

The report is `{ "errors": number, "warnings": number, "issues": [...] }`, one entry per issue with `filePath`, `line`, `column`, `ruleId`, `message`, `severity` and, where the rule gives one, `help`:

```bash
jq '.issues | length' pickier-lint.json
```
