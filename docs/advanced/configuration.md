# Advanced Configuration

This guide covers advanced Pickier configuration topics for teams and complex projects. If you're just getting started, check out the [basic configuration guide](../config.md) first.

## Configuration File Formats

Pickier supports multiple configuration formats to fit your workflow. The configuration file should be placed at your project root.

### TypeScript Configuration (Recommended)

Using TypeScript gives you type checking and autocomplete in your editor:

```ts
import type { PickierConfig } from 'pickier'

export default {
  lint: {
    extensions: ['ts', 'tsx', 'js', 'jsx'],
  },
  rules: {
    noDebugger: 'error',
  },
} satisfies PickierConfig
```The`satisfies`keyword ensures your configuration is valid while preserving the exact types. This catches typos and invalid values before you even run Pickier.

### JavaScript Configuration

If TypeScript isn't available in your project, you can use JavaScript:```js
/**@type {import('pickier').PickierConfig}*/
export default {
  lint: {
    extensions: ['js', 'jsx'],
  },
  rules: {
    noDebugger: 'error',
  },
}

```The JSDoc comment provides type hints in editors that support it.

### JSON Configuration

For simpler projects or when you prefer JSON:```json
{
  "lint": {
    "extensions": ["ts", "tsx"]
  },
  "rules": {
    "noDebugger": "error"
  }
}
```Name it`.pickierrc.json`and place it at your project root.

## Understanding Rule Severity

Rules in Pickier can have three severity levels, and choosing the right one depends on your team's needs and the nature of the rule.

### Error Level

Use`'error'`for rules that catch actual bugs or prevent broken code from being committed. These will fail CI builds and prevent commits if you have pre-commit hooks set up:```ts
export default {
  rules: {
    noDebugger: 'error',
    noCondAssign: 'error',
  },
  pluginRules: {
    'pickier/no-unused-vars': 'error',
  },
}

```Errors show up with red underlines in VS Code and are counted separately from warnings in the output.

### Warning Level

Use`'warn'`for style preferences and best practices that won't break your code but should be addressed eventually:```ts
export default {
  rules: {
    noConsole: 'warn',
  },
  pluginRules: {
    'pickier/prefer-template': 'warn',
  },
}
```Warnings show up with yellow underlines and won't fail your build by default (though you can change this with the`PICKIER_FAIL_ON_WARNINGS=1`environment variable).

### Off Level

Use`'off'`to completely disable a rule. This is useful when a rule doesn't fit your project or conflicts with your team's coding style:```ts
export default {
  rules: {
    noConsole: 'off',
  },
}

```## Glob Patterns and Ignoring Files

Pickier uses glob patterns to determine which files to lint and which to ignore. Understanding these patterns helps you fine-tune what gets checked.

### Basic Ignore Patterns

The`ignores`array accepts glob patterns that match files to skip:```ts
export default {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/build/**',
    '**/coverage/**',
  ],
}
```

Double asterisks (`**`) match any number of directories, making these patterns work regardless of where they appear in your project structure.

### Advanced Patterns

You can use more specific patterns to ignore certain file types or directories:

```ts
export default {
  ignores: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/fixtures/**',
    '**/**tests**/**',
    '**/legacy-code/**',
    '**/*.generated.ts',
  ],
}
```### Negation Patterns

Sometimes you want to ignore most files but include a few exceptions. Use negation patterns (starting with`!`) to override previous ignores:

```ts
export default {
  ignores: [
    '**/vendor/**',
    '!**/vendor/our-package/**',
  ],
}
```This ignores everything in vendor directories except the our-package subdirectory.

## Plugin Configuration

Plugins extend Pickier with additional rules. Understanding how to configure them gives you fine-grained control over your linting.

### Enabling Plugin Rules

Plugin rules use a namespaced format with the plugin name followed by the rule name:```ts
export default {
  pluginRules: {
    'pickier/no-unused-vars': 'error',
    'pickier/prefer-const': 'error',
    'style/quotes': 'warn',
    'regexp/no-super-linear-backtracking': 'error',
  },
}

```### Using Short Names

For convenience, you can use bare rule names without the plugin prefix for pickier's own rules:```ts
export default {
  pluginRules: {
    'no-unused-vars': 'error',
    'prefer-const': 'error',
  },
}
```Pickier automatically expands these to`pickier/no-unused-vars`and`pickier/prefer-const`.

### Configuring Shell Rules

Shell rules are enabled by default with sensible severities. Customize them as needed:

```ts
export default {
  pluginRules: {
    'shell/command-substitution': 'error',
    'shell/no-eval': 'error',
    'shell/quote-variables': 'warn',
    'shell/set-options': 'warn', // off by default, enable for stricter scripts
    'shell/prefer-double-brackets': 'warn',
  },
}
```

Shell formatting (indentation normalization) is applied automatically when shell file extensions are included in `format.extensions` (they are by default).

### Configuring Sort Rules

Sort rules are powerful but can cause large diffs when first enabled. Enable them gradually:

```ts
export default {
  pluginRules: {
    'pickier/sort-imports': 'warn',
    'pickier/sort-named-imports': 'warn',
  },
}
```Start with warnings to see the impact, then increase to errors once your codebase is sorted.

## Format Options

Format options control how Pickier transforms your code when applying fixes.

### Quote Style

Choose between single and double quotes throughout your codebase:```ts
export default {
  format: {
    quotes: 'single',
  },
}

```This affects both the`quotes`rule and how other fixes format strings. Pickier respects JSON files and always uses double quotes there.

### Indentation

Control both the size and type of indentation:```ts
export default {
  format: {
    indent: 2,
    indentStyle: 'spaces',
  },
}
```The combination of these settings determines how Pickier formats your code. Popular choices are 2 spaces, 4 spaces, or tabs.

### Semicolons

Control whether to use semicolons or let ASI (Automatic Semicolon Insertion) handle them:```ts
export default {
  format: {
    semi: false,
  },
}

```Setting to`false`removes unnecessary semicolons while keeping required ones (like in for loops).

## Environment-Specific Configuration

Different environments often need different rules. Here's how to handle that.

### Multiple Configuration Files

Create different configs for different environments:```ts
export default {
  lint: {
    extensions: ['ts', 'tsx', 'js', 'jsx'],
  },
  rules: {
    noDebugger: process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    noConsole: process.env.NODE_ENV === 'production' ? 'error' : 'off',
  },
}
```This allows console.log during development but errors in production.

### VS Code Workspace Configuration

Point VS Code to different configs per workspace:```json
{
  "pickier.configPath": "configs/pickier.development.ts"
}

```This is useful in monorepos where different packages have different needs.

## Performance Optimization

For large codebases, these optimizations can make Pickier significantly faster.

### Limiting File Extensions

Only lint the file types you actually use:```ts
export default {
  lint: {
    extensions: ['ts', 'tsx'],
  },
}
```Removing unnecessary extensions means Pickier processes fewer files.

### Strategic Ignores

Ignore large vendor directories or generated code:```ts
export default {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/generated/**',
    '**/*.bundle.js',
  ],
}

```Each ignored directory means thousands of files Pickier doesn't need to process.

### Disabling Expensive Rules

Some rules require more computation than others. If performance is critical, consider disabling the most expensive ones in development:```ts
export default {
  pluginRules: {
    'regexp/no-super-linear-backtracking': process.env.CI ? 'error' : 'off',
  },
}
```This keeps CI builds strict while making local development faster.

## Team Configuration

When working in a team, consistency is key. These practices help everyone stay on the same page.

### Shared Configuration

Create a base configuration that all team members use:```ts
import type { PickierConfig } from 'pickier'

export const teamConfig: PickierConfig = {
  rules: {
    noDebugger: 'error',
    noConsole: 'warn',
  },
  pluginRules: {
    'pickier/no-unused-vars': 'error',
    'pickier/prefer-const': 'error',
  },
  format: {
    quotes: 'single',
    indent: 2,
    indentStyle: 'spaces',
  },
}

export default teamConfig

```### Extending Configuration

Individual developers can extend the base config for their specific needs:```ts
import { teamConfig } from './pickier.team.config'

export default {
  ...teamConfig,
  pluginRules: {
    ...teamConfig.pluginRules,
    'pickier/sort-imports': 'warn',
  },
}
```This preserves team standards while allowing personal preferences.

### Git Hooks

Enforce rules before code is committed:```bash
npx husky install
npx husky add .husky/pre-commit "npx pickier run . --mode lint --fix"

```This ensures all committed code meets your standards.

## Monorepo Configuration

In monorepos, different packages often need different configurations.

### Package-Specific Configs

Each package can have its own`pickier.config.ts`:

```monorepo/

├── packages/
│   ├── web/
│   │   └── pickier.config.ts
│   ├── api/
│   │   └── pickier.config.ts
│   └── shared/
│       └── pickier.config.ts
└── pickier.config.ts```Pickier uses the closest config file it finds.

### Shared Base Config

Create a shared base config that packages extend:```ts
import type { PickierConfig } from 'pickier'

export const baseConfig: PickierConfig = {
  rules: {
    noDebugger: 'error',
  },
  pluginRules: {
    'pickier/no-unused-vars': 'error',
  },
}

```Then in each package:```ts

import { baseConfig } from '../../pickier.base.config'

export default {
  ...baseConfig,
  lint: {
    extensions: ['ts', 'tsx'],
  },
}

```## Continuous Integration

Make Pickier part of your CI pipeline to catch issues before they reach production.

### GitHub Actions```yaml

name: Lint
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:

      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run pickier run . --mode lint

```### Fail on Warnings

By default, Pickier only fails on errors. To also fail on warnings in CI:```yaml

- run: PICKIER_FAIL_ON_WARNINGS=1 bun run pickier run . --mode lint

```### Verbose Output in CI

Get detailed output in CI for easier debugging:```ts
export default {
  lint: {
    verbose: process.env.CI === 'true',
  },
}

```## Best Practices

After working with many teams, these patterns have proven most effective.

### Start Conservative

Begin with fewer rules enabled and gradually add more:```ts
export default {
  rules: {
    noDebugger: 'error',
  },
  pluginRules: {
    'pickier/no-unused-vars': 'warn',
  },
}

```This prevents overwhelming your team with hundreds of violations.

### Use Warnings First

When adding new rules, start with`'warn'`:

```ts

export default {
  pluginRules: {
    'pickier/prefer-const': 'warn',
  },
}

```After violations are fixed, promote to`'error'`.

### Document Your Decisions

Add comments explaining why rules are configured a certain way:

```ts

export default {
  rules: {
    noConsole: 'off',
  },
  pluginRules: {
    'pickier/prefer-template': 'warn',
  },
}

```

This helps future maintainers understand the reasoning.

## Related

- [Rules Reference](../rules/index.md)
- [Basic Configuration](../config.md)
- [CLI Reference](../cli.md)
- [VS Code Extension](../vscode.md)
