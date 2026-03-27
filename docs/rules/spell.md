# spell

The `spell` plugin provides spell-checking rules powered by [ts-spell-check](https://github.com/stacksjs/ts-spell-check). It's an optional feature — install `ts-spell-check` to enable it.

- Category: Plugin (optional)
- Rules: 3
- Auto-fixable: 0 (suggestions provided via help text)
- Default: All rules off (opt-in)
- Requires: `bun add -D ts-spell-check`

## Overview

When `ts-spell-check` is installed as a dependency, pickier gains three spell-checking rules:

- **spell/check** — Check spelling in all text content
- **spell/check-comments** — Check spelling only in code comments
- **spell/check-markdown** — Check spelling only in markdown files

The spell checker includes a 234K-word English dictionary, 200+ programming terms, and 150+ common misspelling corrections. It handles camelCase, PascalCase, snake_case, and other code naming conventions automatically.

## Setup

```bash
# Install the optional dependency
bun add -D ts-spell-check
```

```ts
// pickier.config.ts
export default {
  pluginRules: {
    'spell/check': 'warn',           // check everything
    // or pick specific scopes:
    'spell/check-comments': 'warn',  // comments only
    'spell/check-markdown': 'warn',  // markdown files only
  },
}
```

## Configuration

Pass options to spell rules using the `[severity, options]` tuple:

```ts
export default {
  pluginRules: {
    'spell/check-comments': ['warn', {
      words: ['kubernetes', 'grafana', 'nginx'],  // extra dictionary words
      minWordLength: 4,                            // skip short words
    }],
  },
}
```

## Rules

### spell/check

- **Default:** `off`
- **Auto-fix:** No (suggestions in help text)

Check spelling in all text content of a file. Handles code, comments, strings, and prose.

```ts
// Bad
const recieve = true    // "recieve" flagged → Did you mean: receive?
const seperate = false  // "seperate" flagged → Did you mean: separate?

// Good
const receive = true
const separate = false
```

### spell/check-comments

- **Default:** `off`
- **Auto-fix:** No

Check spelling only in comment lines (`//`, `/*`, `#`). Code identifiers are not checked.

```ts
// This has a definately wrong word    ← flagged
const definately = true                 // ← NOT flagged (code, not comment)
```

### spell/check-markdown

- **Default:** `off`
- **Auto-fix:** No

Check spelling only in `.md` files. Skips non-markdown files entirely.

## In-Document Directives

Spell rules respect in-document directives (cspell-compatible):

```ts
// spell-check:disable
const xyzzy = 'plugh'  // not flagged
// spell-check:enable

// spell-check:disable-next-line
const qwerty = 'asdf'  // not flagged

// spell-check:word kubectl minikube
deploy(kubectl)  // not flagged

// cspell:words also works
```

## What's Not Flagged

The spell checker automatically accepts:
- **Programming keywords** — `const`, `async`, `function`, `interface`, etc.
- **Common abbreviations** — `args`, `cfg`, `ctx`, `env`, `fn`, `idx`, `opts`, `src`, etc.
- **Technical terms** — `api`, `cdn`, `cors`, `http`, `json`, `npm`, `sql`, `wasm`, etc.
- **Short words** (< 3 chars) — `a`, `is`, `to`, `of`, etc.
- **Uppercase acronyms** (≤ 5 chars) — `API`, `HTTP`, `JSON`, `DNS`, etc.
- **CamelCase parts** — `myVariable` → checks "my" and "Variable" separately

## Graceful Degradation

If `ts-spell-check` is not installed, the spell rules silently return no issues. Pickier works normally without it — spell checking is purely opt-in.
