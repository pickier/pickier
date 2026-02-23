# ESLint Integration

Pickier provides ESLint compatibility through its plugin system and disable directive support.

## ESLint-Style Directives

Pickier supports ESLint-style disable comments:

### Disable Next Line

```typescript
// eslint-disable-next-line no-console
console.log('This is allowed')

// Disable multiple rules
// eslint-disable-next-line no-console, no-debugger
console.log('Allowed')
```

### Disable Block

```typescript
/* eslint-disable no-console */
console.log('Allowed')
console.log('Also allowed')
/* eslint-enable no-console */

console.log('This will warn again')
```

### Pickier Prefix

You can also use `pickier-` prefix:

```typescript
// pickier-disable-next-line no-console
console.log('Allowed')

/* pickier-disable no-console */
console.log('Allowed')
/* pickier-enable no-console */
```

## Plugin System Comparison

| Feature | ESLint | Pickier |
|---------|--------|---------|
| Rule format | Similar | Similar |
| Severity levels | 0/1/2 or off/warn/error | off/warn/error |
| Rule options | Array syntax | Array syntax |
| Plugins | npm packages | In-config or npm |
| Disable comments | Yes | Yes |

## Migrating from ESLint

### Basic Migration

**ESLint config (before):**

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-console': 'warn',
    'no-debugger': 'error',
    'semi': ['error', 'never'],
    'quotes': ['error', 'single'],
  }
}
```

**Pickier config (after):**

```typescript
// pickier.config.ts
export default {
  rules: {
    noConsole: 'warn',
    noDebugger: 'error',
  },

  format: {
    semi: false,
    quotes: 'single',
  },
}
```

### Plugin Migration

**ESLint with plugins:**

```javascript
module.exports = {
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
  }
}
```

**Pickier equivalent:**

```typescript
export default {
  pluginRules: {
    'ts/no-any': 'warn',
  },
}
```

## Built-in Rule Mapping

| ESLint Rule | Pickier Rule |
|-------------|--------------|
| `no-console` | `rules.noConsole` or `general/no-console` |
| `no-debugger` | `rules.noDebugger` or `general/no-debugger` |
| `semi` | `format.semi` |
| `quotes` | `format.quotes` |
| `indent` | `format.indent` |
| `no-trailing-spaces` | `format.trimTrailingWhitespace` |

## Using with ESLint

You can run Pickier alongside ESLint:

```json
{
  "scripts": {
    "lint": "eslint . && pickier lint .",
    "lint:fix": "eslint . --fix && pickier lint . --fix"
  }
}
```

### Complementary Setup

Use ESLint for TypeScript-specific rules, Pickier for formatting:

```typescript
// pickier.config.ts
export default {
  // Let ESLint handle these
  pluginRules: {
    'ts/no-any': 'off',  // Use @typescript-eslint
  },

  // Pickier handles formatting
  format: {
    quotes: 'single',
    semi: false,
    indent: 2,
  },
}
```

```javascript
// eslint.config.js
import tseslint from '@typescript-eslint/eslint-plugin'

export default [
  {
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
    }
  }
]
```

## Rule ID Format

Pickier uses a `plugin/rule-name` format:

```typescript
pluginRules: {
  // General plugin
  'general/no-debugger': 'error',

  // Quality plugin
  'quality/no-unused-vars': 'warn',

  // TypeScript plugin
  'ts/no-any': 'warn',
  'ts/explicit-return-type': 'off',

  // Style plugin
  'style/max-line-length': ['warn', { max: 100 }],

  // Markdown plugin
  'markdown/heading-increment': 'error',
}
```

## Creating Compatible Rules

Write rules that follow ESLint patterns:

```typescript
import type { PickierPlugin, RuleContext, LintIssue } from 'pickier'

export const myPlugin: PickierPlugin = {
  name: 'my-eslint-compat',
  rules: {
    'no-foo': {
      meta: {
        docs: 'Disallow foo',
        recommended: true,
      },

      // Check function (like ESLint's create)
      check(content: string, ctx: RuleContext): LintIssue[] {
        const issues: LintIssue[] = []
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('foo')) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: lines[i].indexOf('foo') + 1,
              ruleId: 'my-eslint-compat/no-foo',
              message: 'Unexpected "foo".',
              severity: 'error',
            })
          }
        }

        return issues
      },

      // Fix function (like ESLint's fix)
      fix(content: string, ctx: RuleContext): string {
        return content.replace(/foo/g, 'bar')
      },
    },
  },
}
```

## Disable Directive Parsing

Pickier parses directives from comments:

```typescript
// Supported formats
// eslint-disable-next-line rule1, rule2
// eslint-disable rule1
// eslint-enable rule1
// pickier-disable-next-line rule1
// pickier-disable rule1
// pickier-enable rule1

/* eslint-disable rule1 */
/* eslint-enable rule1 */
/* pickier-disable rule1 */
/* pickier-enable rule1 */
```

## Known Differences

1. **Rule Names**: Pickier uses camelCase built-in rules (`noConsole`), while ESLint uses kebab-case (`no-console`)

2. **Config Format**: Pickier uses TypeScript config, ESLint supports multiple formats

3. **Fixing**: Pickier runs fixes in up to 5 passes for composable fixes

4. **Plugin Loading**: Pickier plugins are configured inline, not from node_modules by default

5. **Severity**: Both use `off`, `warn`, `error`, but ESLint also accepts `0`, `1`, `2`

## Related

- [Configuration](/guide/configuration)
- [Plugin Development](/guide/plugins)
- [Rules Reference](/rules/)
