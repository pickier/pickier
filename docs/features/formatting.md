# Formatting

Pickier’s formatter focuses on speed, stability, and predictable diffs. It does not attempt full AST reprinting; instead it applies a set of targeted, deterministic transforms that cover the 80% of day-to-day cleanup needs.

What the formatter does:

- Whitespace normalization
  - trims trailing spaces on each line
  - collapses consecutive blank lines to a configured maximum
  - enforces a final newline policy: `one`, `two`, or `none`- Code style for TS/JS
  - indentation is normalized to spaces using`format.indent`- quotes are converted to`format.quotes` (`single`or`double`)
  - predictable code spacing around braces, commas, and `=`/comparison operators
  - optional semicolon normalization via `format.semi`- Import management for TS/JS files (see Features » Import Management)
- Known JSON/config files get stable key ordering (see Features » JSON & Config Sorting)
- Shell script formatting (`.sh`, `.bash`, `.zsh`)
  - indentation normalization for `if`/`then`/`fi`, `case`/`esac`, `while`/`for`/`do`/`done`, function bodies
  - heredoc content preserved verbatim
  - detected by extension or shebang (`#!/bin/bash`, `#!/usr/bin/env zsh`, etc.)

It intentionally avoids touching:

- template strings/backticks
- content within string literals
- shell script quoting semantics (single vs double quotes have different meanings in shell)

## Configuration

Set options in`pickier.config.*`under`format`:

```ts
import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  format: {
    extensions: ['ts', 'js', 'html', 'css', 'json', 'jsonc', 'md', 'yaml', 'yml', 'stx', 'sh', 'bash', 'zsh'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one', // 'one' | 'two' | 'none'
    indent: 2,
    quotes: 'single', // 'single' | 'double'
    semi: false,
  },
}
export default config
```CLI usage:```bash

# check without writing

pickier format . --check

# write changes

pickier format src --write

# restrict to TS/JS

pickier format . --ext .ts,.tsx,.js,.jsx --write

```## Whitespace normalization

Trailing spaces are removed and blank lines are collapsed per`maxConsecutiveBlankLines`.

Before:

```ts

function demo() {
  console.log('hi')
}

```

After (`maxConsecutiveBlankLines: 1`):

```ts

function demo() {
  console.log('hi')
}

```### Final newline policy

Pick one of:

-`one`: ensure exactly one trailing newline (default). If the file contains imports, the formatter may ensure one additional separator newline after the import block as needed while still ending with a single final newline.

- `two`: end with a blank line and a final newline (i.e., two newlines total at EOF)
- `none`: strip all trailing newlines

Examples:

```text

"abc"            -> one  -> "abc\n"
"abc\n\n\n"       -> one  -> "abc\n"
"abc"            -> two  -> "abc\n\n"
"abc\n"          -> none -> "abc"

```## Indentation (TS/JS)

Pickier supports two indentation styles:

- spaces (default): indentation normalized to multiples of`format.indent`- tabs: indentation normalized to tabs; each level corresponds to one`\t`, while `format.indent`controls visual width for spacing calculations and diagnostics

Before:```ts
if (ok) {
\tconsole.log('x')
    if (y) {
       doThing()
    }
}
```

After (`indentStyle: 'spaces'`, `indent: 2`):

```ts
if (ok) {
  console.log('x')
  if (y) {
    doThing()
  }
}
```

Using tabs (`indentStyle: 'tabs'`):

```ts
if (ok) {
  console.log('x')
  if (y) {
    doThing()
  }
}
```## Quote style (TS/JS)

Quotes in string literals are converted to your preference. Template strings are not modified.

Before:```ts
const a = 'hello'; const b = 'bye'

```

After (`quotes: 'single'`):

```ts

const a = 'hello'; const b = 'bye'

```

After (`quotes: 'double'`):

```ts

const a = 'hello'; const b = 'bye'

```Escapes are adjusted so the literal content remains the same. For example, converting`"He said \"hi\""`becomes`'He said "hi"'`.

## Code spacing (TS/JS)

The formatter inserts minimal spaces to improve readability:

- before `{`in blocks/objects:`if (x){`->`if (x) {`- after commas:`a,b`->`a, b`- around single`=`not part of`==`, `===`, `=>`, `<=`, `>=`: `a=b`->`a = b`- around`<`and`>`in common contexts:`a<b`->`a < b`, `a>b`->`a > b`Lines are also cleaned to avoid runs of multiple spaces (leading indentation is preserved).

## Semicolons (TS/JS)

When`format.semi`is true, Pickier performs semicolon normalization that is safe with respect to JavaScript ASI and common patterns:

- removes empty statement lines composed solely of semicolons
- collapses duplicate trailing semicolons to a single one
- keeps semicolons inside`for (...)`headers
- keeps a single trailing semicolon at the end of a statement (to preserve current semantics and avoid surprising changes)

Before:```ts
foo()
// stray empty statement
for (let i = 0; i < 10; i++); // keep header semicolons
```After:```ts

foo()
// (empty statement removed)
for (let i = 0; i < 10; i++); // unchanged header semicolons

```If you want fully semicolon-free style, set`semi: true` and combine with a linter rule or an additional codemod to strip the remaining statement-terminating semicolons.

## Import management

For TS/JS files, imports are parsed and rewritten to a canonical form (see Features » Import Management for details). This happens before indentation and spacing so the import block is clean and separated from code by a blank line when appropriate.

Pickier also removes any leading blank lines at the very top of the file to keep headers tidy.

## JSON and config files

For known JSON files (`package.json`, `tsconfig*.json`), keys are ordered deterministically (see Features » JSON & Config Sorting). Other JSON files are left as-is except for whitespace normalization and final newline policy.

## Shell script formatting

For shell scripts (`.sh`, `.bash`, `.zsh`), Pickier normalizes indentation based on shell control structures. Heredoc content is always preserved verbatim.

Before:

```bash
#!/bin/bash
if [[ -f config ]]; then
echo "found"
for line in $(cat config); do
echo "$line"
done
fi
```

After (`indent: 2`):

```bash
#!/bin/bash
if [[ -f config ]]; then
  echo "found"
  for line in $(cat config); do
    echo "$line"
  done
fi
```

Supported structures: `if`/`then`/`elif`/`else`/`fi`, `while`/`for`/`until`/`do`/`done`, `case`/`esac`, function bodies `{ }`, and arbitrary nesting.

See [Shell Rules](/rules/shell) for the full set of 21 linting rules available for shell scripts.

## Large example

Before:

```ts

import type { AA, TT } from 'z'
import type { C } from './t'
import { A as Alias, B } from 'z'
import { a, b, c } from './x'
import 'side-effect'
const s = 'str'
if (ready) {
  for (let i = 0; i < 10; i++) { console.log(s) }
}

```

After (`indent: 2`, `quotes: 'single'`, `semi: true`):

```ts

import type { AA, TT } from 'z'
import { a, b, c } from './x'
import 'side-effect'

const s = 'str'
if (ready) {
  for (let i = 0; i < 10; i++) { console.log(s) }
}

```Notes:

- type imports are grouped first, side-effects preserved, and named imports sorted
- quotes converted to single quotes
- spacing and indentation normalized
- duplicate semicolons/empty statements removed; single statement semicolons kept

## Best practices

- Keep`maxConsecutiveBlankLines`to`1`to avoid noisy diffs
- Use`quotes: 'single'`or`quotes: 'double'`consistently across the codebase
- Prefer`indent: 2`*(or tabs)*for compact diffs, unless your codebase standardizes on 4
- Use `--check`in CI to fail builds when formatting is needed
- Combine with the Linter to catch stylistic drift (e.g.,`noDebugger`)

## Troubleshooting

- Imports not moving? Ensure the import block is at the top of the file; only the leading contiguous import block is managed
- Template string not reformatted? This is by design; use a follow-up codemod if needed
- YAML/MD spacing “changed”? Only trailing spaces and final newline policy are applied; content is untouched

## FAQ

Q: Can I change indentation to tabs?

A: Currently the formatter converts tabs to spaces. Use a downstream tool if tabs are required throughout.

Q: Does it reorder object keys?

A: Only JSON keys in known files (`package.json`, `tsconfig*.json`) are ordered. Source object literals are left as-is; consider plugin rules such as `sort-objects`or`sort-keys` for lint-only checks.
