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

# Format files
./zig-out/bin/pickier run . --mode format --write

# Check without modifying
./zig-out/bin/pickier run . --mode lint --check
```

## Features

- **Native Performance** - Compiled Zig binary for minimal startup and maximum throughput
- **Formatting Engine** - Handles indentation, quotes, semicolons, and whitespace
- **Lint Scanner** - Detects code quality issues with configurable rules
- **JSON Sorting** - Sorts keys in JSON and config files
- **Markdown Rules** - Lints markdown documentation for consistency
- **File Walker** - Efficient recursive directory traversal with ignore support
- **Directive Parsing** - Supports ESLint-style disable/enable comments
- **Multiple Reporters** - Stylish, compact, and JSON output formats

## License

MIT
