# Defaults

Pickier ships with sensible defaults. You can import and inspect them:

```ts
import { defaultConfig, config as loadedConfig } from 'pickier'
```

Static defaults from `packages/pickier/src/config.ts`:

```ts
export const defaultConfig = {
  ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/coverage/**'],
  lint: {
    extensions: ['ts', 'js', 'html', 'css', 'json', 'jsonc', 'md', 'yaml', 'yml', 'stx'],
    reporter: 'stylish',
    cache: false,
    maxWarnings: -1,
  },
  format: {
    extensions: ['ts', 'js', 'html', 'css', 'json', 'jsonc', 'md', 'yaml', 'yml', 'stx'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one', // 'one' | 'two' | 'none'
    indent: 2,
    indentStyle: 'spaces',
    quotes: 'single', // 'single' | 'double'
    semi: false,
  },
  rules: {
    noDebugger: 'error',
    noConsole: 'warn',
  },
  verbose: false,
}
```

At runtime, `config` is loaded via `bunfig`, which merges your local `pickier.config.*` over `defaultConfig`.
