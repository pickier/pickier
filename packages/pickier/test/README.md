# Test Suite Structure

This directory contains all tests for the Pickier package, organized into logical categories.

## Directory Structure

```text
test/
├── core/ - Core functionality & utilities
│ ├── ast.test.ts
│ ├── utils.test.ts
│ ├── ignored-dirs.test.ts
│ ├── ignored-dirs-cli.test.ts
│ └── style-consistency.test.ts
│
├── format/ - Formatting tests
│ ├── format.test.ts
│ ├── format-more.test.ts
│ ├── format-advanced-cases.test.ts
│ ├── format-edge-cases.test.ts
│ ├── format-semi.test.ts
│ ├── format-semi-edge.test.ts
│ ├── quotes-indent.test.ts
│ ├── formatter-fixtures.test.ts
│ └── imports/ - Import formatting
│ ├── format-imports.test.ts
│ ├── format-import-edge-cases.test.ts
│ └── format-imports-edge.test.ts
│
├── lint/ - Linting tests
│ ├── lint.test.ts
│ ├── lint-more.test.ts
│ ├── lint-config.test.ts
│ ├── lint-disable-next-line.test.ts
│ ├── lint-fixtures-disable-next-line.test.ts
│ └── lint-programmatic.test.ts
│
├── rules/ - ESLint rules tests
│ ├── sort/ (13 tests)
│ ├── style/ (5 tests)
│ ├── quality/ (4 tests)
│ ├── imports/ (3 tests)
│ ├── typescript/ (3 tests)
│ ├── regexp/ (2 tests)
│ └── rules-pickier-edge-cases.test.ts
│
├── plugin/ - Plugin system tests
│ ├── plugin-system.test.ts
│ └── plugin-system-advanced.test.ts
│
├── fixtures/ - Test fixtures
├── output/ - Test output files
└── helpers.ts - Shared test utilities
```

## Running Tests

Tests can be run from **anywhere** in the monorepo thanks to proper workspace configuration.

```bash
# From monorepo root (~/Code/pickier)

bun test # Run all pickier tests
bun run test:format # Run format tests only
bun run test:lint # Run lint tests only
bun run test:rules # Run all rule tests
bun run test:plugin # Run plugin tests only
bun run test:core # Run core tests only
bun run test:watch # Run tests in watch mode

# From package directory (~/Code/pickier/packages/pickier)

bun test # Run all tests
bun test test/format # Run tests for specific category
bun test test/lint
bun test test/rules
bun test test/plugin
bun test test/core

# Run tests for specific subcategory

bun test test/rules/sort
bun test test/rules/style
bun test test/format/imports

# Run with coverage

bun test --coverage
```

## Test Helpers

The `helpers.ts` file provides common utilities to reduce code duplication:

```typescript
import { formatHelpers, lintHelpers, ruleHelpers } from './helpers'

// Create temp directories for testing
const tempDir = formatHelpers.createTempDir()
```

## Adding New Tests

1. **Determine the category** - Is it format, lint, rules, plugin, or core?
2. **Choose the right subcategory** - For rules, determine if it's sort, style, quality, imports, typescript, or regexp
3. **Follow naming conventions** - Use descriptive names that match the pattern
4. **Use test helpers** - Import and use helpers from `helpers.ts` to reduce duplication
5. **Update imports** - Ensure relative paths to `src/` are correct based on nesting level

## Test File Naming

- **Format tests**: `format-{feature}.test.ts`
- **Lint tests**: `lint-{feature}.test.ts`
- **Rule tests**: `rules-{rule-name}.test.ts`
- **Plugin tests**: `plugin-{feature}.test.ts`
- **Core tests**: `{feature}.test.ts`
