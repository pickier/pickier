# publint

The `publint` plugin validates `package.json` files for correct npm publishing configuration. It checks exports/imports ordering, field types, file format mismatches, module system issues, and more.

Ported natively from [publint](https://publint.dev) — no extra dependency needed.

- Category: Plugin
- Rules: 20 total
- Targets: `package.json` files only
- Default: All rules enabled

## Overview

The publint plugin ensures your package is correctly configured for consumption by Node.js, bundlers, and TypeScript. Rules are organized into two tiers:

- **Tier 1 — JSON analysis** (15 rules): Pure `package.json` validation — no filesystem access
- **Tier 2 — File verification** (5 rules): Reads referenced files to check format, existence, and executability

## Configuration

All publint rules are enabled by default with sensible severities. Override in `pluginRules`:

```ts
export default {
  pluginRules: {
    // Disable a rule
    'publint/use-type': 'off',

    // Change severity
    'publint/exports-missing-root-entrypoint': 'error',
  }
}
```

## Rules Reference

### Exports & Imports Ordering

| Rule | Default | Description |
|------|---------|-------------|
| `publint/exports-types-should-be-first` | `error` | `types` condition must be the first key in an exports condition object so TypeScript can resolve it |
| `publint/exports-default-should-be-last` | `error` | `default` condition must be the last key so it doesn't shadow subsequent conditions |
| `publint/exports-module-should-precede-require` | `error` | `module` condition must come before `require` so bundlers prefer ESM |
| `publint/imports-default-should-be-last` | `error` | Same as above, for `imports` field |
| `publint/imports-module-should-precede-require` | `error` | Same as above, for `imports` field |

**Example — bad:**

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.mjs"
    }
  }
}
```

**Example — good:**

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "default": "./dist/index.mjs"
    }
  }
}
```

### Exports & Imports Values

| Rule | Default | Description |
|------|---------|-------------|
| `publint/exports-value-invalid` | `error` | Exports values must start with `./` |
| `publint/imports-key-invalid` | `error` | Imports keys must start with `#` |
| `publint/imports-value-invalid` | `error` | Relative imports values must start with `./` |
| `publint/exports-missing-root-entrypoint` | `warn` | When `main`/`module` exist alongside `exports`, the `"."` entrypoint should be defined |
| `publint/exports-fallback-array-use` | `warn` | Fallback arrays in exports are not recommended — they behave inconsistently across tools |

**Example — `exports-value-invalid`:**

```json
// Bad
{ "exports": { ".": "dist/index.mjs" } }

// Good
{ "exports": { ".": "./dist/index.mjs" } }
```

**Example — `imports-key-invalid`:**

```json
// Bad
{ "imports": { "utils": "./src/utils.js" } }

// Good
{ "imports": { "#utils": "./src/utils.js" } }
```

### Package Structure

| Rule | Default | Description |
|------|---------|-------------|
| `publint/use-type` | `warn` | The `"type"` field should be specified to help Node.js resolve modules without detection overhead |
| `publint/has-module-but-no-exports` | `warn` | When `module` exists but `exports` does not, Node.js will ignore the ESM entry point |
| `publint/deprecated-field-jsnext` | `warn` | `jsnext:main` and `jsnext` are deprecated — use `module` instead |
| `publint/field-invalid-value-type` | `error` | Package fields must have correct types (e.g. `main` must be a string, not a number) |
| `publint/local-dependency` | `error` | Dependencies using `file:` or `link:` protocols won't work for end-users |

### File Verification (Tier 2)

These rules read files from disk relative to `package.json` to verify correctness.

| Rule | Default | Description |
|------|---------|-------------|
| `publint/file-does-not-exist` | `error` | Files referenced in `main`, `module`, `types`, `bin`, and `exports` must exist |
| `publint/file-invalid-format` | `warn` | A file's code format (ESM/CJS) must match the expected format based on its extension and `type` field |
| `publint/module-should-be-esm` | `error` | The `module` field must point to an ESM file (not CJS) |
| `publint/bin-file-not-executable` | `error` | Bin files must start with a shebang (`#!/usr/bin/env node`) |
| `publint/exports-module-should-be-esm` | `error` | Files under the `module` condition in exports/imports must be ESM |

**Example — `bin-file-not-executable`:**

```js
// Bad — bin/cli.js
console.log('hello')

// Good — bin/cli.js
#!/usr/bin/env node
console.log('hello')
```

## All Rules at a Glance

| Rule | Severity | Category |
|------|----------|----------|
| `publint/exports-types-should-be-first` | `error` | Ordering |
| `publint/exports-default-should-be-last` | `error` | Ordering |
| `publint/exports-module-should-precede-require` | `error` | Ordering |
| `publint/exports-value-invalid` | `error` | Values |
| `publint/imports-key-invalid` | `error` | Values |
| `publint/imports-value-invalid` | `error` | Values |
| `publint/imports-default-should-be-last` | `error` | Ordering |
| `publint/imports-module-should-precede-require` | `error` | Ordering |
| `publint/use-type` | `warn` | Structure |
| `publint/deprecated-field-jsnext` | `warn` | Structure |
| `publint/field-invalid-value-type` | `error` | Structure |
| `publint/local-dependency` | `error` | Structure |
| `publint/has-module-but-no-exports` | `warn` | Structure |
| `publint/exports-missing-root-entrypoint` | `warn` | Values |
| `publint/exports-fallback-array-use` | `warn` | Values |
| `publint/file-does-not-exist` | `error` | Files |
| `publint/file-invalid-format` | `warn` | Files |
| `publint/module-should-be-esm` | `error` | Files |
| `publint/bin-file-not-executable` | `error` | Files |
| `publint/exports-module-should-be-esm` | `error` | Files |

## Relationship to publint

This plugin is a native port of [publint](https://publint.dev) into pickier. It implements the same checks without requiring a separate dependency or CLI invocation. The rule names map directly to publint's message codes (e.g. `EXPORTS_TYPES_SHOULD_BE_FIRST` → `publint/exports-types-should-be-first`).

See the [Plugin System](/advanced/plugin-system) for more configuration examples.
