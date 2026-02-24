# pickier

Format, lint, and more in a fraction of a second.

## Installation

```bash
bun add -D pickier
```

```bash
npm install -D pickier
```

## Usage

```bash
# Lint files
pickier lint . --fix

# Format files
pickier format . --write

# Unified command
pickier run . --mode lint --fix
pickier run . --mode format --write
```

### Programmatic API

```typescript
import { lintText, runLintProgrammatic } from 'pickier'

// Lint a single string
const issues = await lintText('const x = "hello";')

// Programmatic lint run
const results = await runLintProgrammatic({
  files: ['src/**/*.ts'],
  fix: true,
})
```

## Features

- **Fast CLI** - Instant feedback powered by Bun
- **Lint and Format** - One tool for both linting and formatting
- **Zero-config Defaults** - Works out of the box, or customize with `pickier.config.ts`
- **Import Organization** - Splits type/value imports, sorts modules and specifiers, removes unused imports
- **JSON Sorting** - Sorts `package.json`, `tsconfig.json`, and other config files
- **Tailwind CSS Class Ordering** - Enforces canonical class order across HTML/JSX/TSX/Vue/Svelte/STX
- **Markdown Linting** - Documentation quality checks with auto-fix support
- **Flexible Formatting** - Configurable indent, quotes, semicolons, whitespace, and more
- **Package.json Validation** - Validates exports ordering, file format, and module system
- **ESLint-style Plugin System** - Load plugins, enable/disable rules
- **CI-friendly Reporters** - Stylish, compact, and JSON output formats
- **Programmatic API** - Use in custom tooling and editor integrations

## License

MIT
