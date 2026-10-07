# Functions

## `runFormat(globs: string[], options: FormatOptions): Promise<number>`

- Expands provided `globs` (directories auto-expand to `**/*`).
- Filters files by `options.ext` or `format.extensions` defaults.
- Normalizes whitespace:
  - trims trailing spaces
  - collapses multiple blank lines to a configured max
  - enforces final newline policy
- Code style for TS/JS:
  - consistent indentation (`format.indent`)
  - quote style (`format.quotes`)
  - optional semicolon normalization (`format.semi`)
- Modes:
  - `check`: prints files needing format, returns 1 if any
  - `write`: writes changes, returns 0
  - default (neither): behaves like `check`

### FormatOptions

```ts
export interface FormatOptions {
  write?: boolean
  check?: boolean
  config?: string
  ignorePath?: string
  ext?: string
  verbose?: boolean
}
```

Return value: `Promise<number>` — process-like exit code.

---

## `runLint(globs: string[], options: LintOptions): Promise<number>`

- Loads `PickierConfig` (defaults or from `options.config`).
- Scans code files for simple issues:
  - `noDebugger`: flags/auto-fixes `debugger` statements
  - `noConsole`: flags `console.*` usage
  - optional heuristics: `noCondAssign`, `noTemplateCurlyInString`, `regexp/no-unused-capturing-group`
- Respects `ignores` patterns from config.
- Reporters:
  - `stylish` (grouped, colored)
  - `json` (machine-readable)
  - `compact` (one-line per issue)
- Built-in plugin rules available via `pluginRules` config (see Rules pages):
  - `sort-objects` — see [/rules/sort-objects](/rules/sort-objects)
- `sort-imports` — see [/rules/sort-imports](/rules/sort-imports)
- `sort-named-imports` — see [/rules/sort-named-imports](/rules/sort-named-imports)
- `sort-heritage-clauses` — see [/rules/sort-heritage-clauses](/rules/sort-heritage-clauses)
  - `sort-keys` — see [/rules/sort-keys](/rules/sort-keys)
  - `sort-exports` — see [/rules/sort-exports](/rules/sort-exports)
  - `max-statements-per-line` — see [/rules/style-max-statements-per-line](/rules/style-max-statements-per-line)
  - `no-unused-vars` — see [/rules/no-unused-vars](/rules/no-unused-vars)
  - `no-super-linear-backtracking` — see [/rules/regexp-no-super-linear-backtracking](/rules/regexp-no-super-linear-backtracking)
  - `prefer-const` — see [/rules/prefer-const](/rules/prefer-const)
- Exit codes:
  - 1 if any errors
  - 1 if warnings exceed `maxWarnings`
  - 0 otherwise

### LintOptions

```ts
export interface LintOptions {
  fix?: boolean
  dryRun?: boolean
  maxWarnings?: number
  reporter?: 'stylish' | 'json' | 'compact'
  config?: string
  ignorePath?: string
  ext?: string
  cache?: boolean
  verbose?: boolean
}
```

Return value: `Promise<number>` — process-like exit code.
