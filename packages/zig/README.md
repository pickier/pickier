# @pickier/zig

Pickier formatter and linter -- native Zig binary for maximum performance.

## Installation

This is a private package used internally within the pickier monorepo. It is not published to npm.

## Usage

### Building

```bash
# Build optimized release binary
zig build -Doptimize=ReleaseFast

# Build debug binary
zig build

# Run tests
zig build test
```

### Running

```bash
# Lint files
./zig-out/bin/pickier run . --mode lint --fix

# Check without modifying
./zig-out/bin/pickier run . --mode lint --check
```

### Formatting is not ready for real code

`run . --mode format --write` works, and rewrites things it should not. The
formatter here is a subset of the TypeScript one
(`packages/pickier/src/format.ts`) that never received the fixes that one has
had, so on a `.ts` file today it:

- Rewrites regex literals. `/a{2,3}/` becomes `/a {2, 3}/` and `/[,]/g`
  becomes `/[, ]/g`, which are different patterns (fixed on the TypeScript
  side in #1369)
- Rewrites the contents of a multi-line template literal, stripping the
  indentation and the trailing spaces that are part of the string (#1361,
  #1366)
- Re-indents block-comment prose, so ` * text` becomes `* text` (#1369)
- Flattens method chains to column 0, and takes a level off the body of a
  callback one of them opens (#1369, #1384)
- Drops the hanging indent of a brace-less `if` or `for` statement (#1369)

It also applies fewer spacing rules than the TypeScript formatter, so the two
disagree on plenty of code that neither of them corrupts, and there is no
parity harness for formatting as there is for the lint rules
(`scripts/parity.ts`).

None of this reaches anyone using the `pickier` npm package: the engine
shipped there (`dist/native/<platform>/pickier-native`) is built from
`src/native_main.zig`, which links the lint batch alone and not this
formatter. What to avoid is formatting a real tree with this binary.

## Features

- **Native Performance** - Compiled Zig binary for minimal startup and maximum throughput
- **Formatting Engine** - Handles indentation, quotes, semicolons, and whitespace; incomplete, and not safe on real code (see above)
- **Lint Scanner** - Detects code quality issues with configurable rules
- **JSON Sorting** - Sorts keys in JSON and config files
- **Markdown Rules** - Lints markdown documentation for consistency
- **File Walker** - Efficient recursive directory traversal with ignore support
- **Directive Parsing** - Supports ESLint-style disable/enable comments
- **Multiple Reporters** - Stylish, compact, and JSON output formats

## License

MIT
