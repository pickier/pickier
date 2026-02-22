import type { PickierOptions } from 'pickier'

// Pickier configuration (local project)
// You can customize lint/format behavior and rule severities here.
// All fields are optional; defaults are shown below.

const config: PickierOptions = {
  // Increase verbosity of CLI outputs (shows detailed error context)
  verbose: true,

  // Glob patterns to ignore
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/pantry/**',
    '**/test/fixtures/**',
    '**/test/output/**',
    '**/*.test.ts', // Ignore test files - they contain intentional examples of problematic code
    '**/*.spec.ts',
    '**/*.bench.ts', // Ignore benchmark files to match ESLint preset behavior
    '**/*.config.ts', // Ignore config files to match ESLint preset behavior
    '**/vscode/examples/**',
    '**/SUMMARY_COMPARISON.md',
    '**/bechmarks/**',
  ],

  // Lint-specific options
  lint: {
    // File extensions to lint
    extensions: ['ts', 'js', 'html', 'css', 'json', 'jsonc', 'md', 'yaml', 'yml', 'stx'],
    // Output format: 'stylish' | 'json' | 'compact'
    reporter: 'stylish',
    // Enable caching (not yet used, reserved)
    cache: false,
    // Fail if warnings exceed this number; -1 disables
    maxWarnings: -1,
  },

  // Format-specific options
  format: {
    // File extensions to format
    extensions: ['ts', 'js', 'html', 'css', 'json', 'jsonc', 'md', 'yaml', 'yml', 'stx'],
    // Remove trailing whitespace
    trimTrailingWhitespace: true,
    // Keep at most this many consecutive blank lines
    maxConsecutiveBlankLines: 1,
    // Final newline policy: 'one' | 'two' | 'none'
    finalNewline: 'one',
    indent: 2,
    quotes: 'single',
    semi: false,
  },

  // Rule severities
  rules: {
    noDebugger: 'error', // remove debugger statements
    noConsole: 'warn', // warn on console usage (tests expect warnings, not errors)
    noTemplateCurlyInString: 'warn', // catch ${} in regular strings
    noCondAssign: 'warn', // assignments in conditionals (common pattern in while/exec loops)
  },

  // Tailwind CSS class ordering
  // Set enabled: true to enforce canonical Tailwind class order across HTML/JSX/TS/JS/STX files.
  // This auto-enables the 'pickier/sort-tailwind-classes' rule at 'warn' severity.
  // tailwind: {
  //   enabled: true,
  //   configPath: './tailwind.config.ts', // optional: path to your tailwind config
  //   callees: ['clsx', 'cn', 'tw'],      // optional: extra utility fn names to scan
  //   attributes: ['class', 'className'], // optional: extra HTML attribute names to scan
  // },

  // Plugin rules (advanced linting)
  pluginRules: {
    'ts/prefer-const': 'warn', // prefer const over let
    'style/curly': 'off', // enforce curly braces for all control statements (disabled for tests)
    'style/if-newline': 'off', // enforce newline after if statement (disabled for tests)
    'pickier/no-unused-vars': 'warn', // catch unused imports/vars
    'pickier/sort-imports': 'off', // too noisy
    'pickier/sort-named-imports': 'off', // too noisy
    'pickier/sort-objects': 'off', // too noisy
    'pickier/sort-exports': 'warn', // sort exports
    'pickier/import-dedupe': 'error', // dedupe imports
    'pickier/no-import-node-modules-by-path': 'error',
    'pickier/no-import-dist': 'error',
    'ts/no-top-level-await': 'error',
    // Style rules - warn to surface issues without blocking CI
    'style/brace-style': 'warn',
    'style/max-statements-per-line': 'warn',
    'style/no-multi-spaces': 'warn',
    'style/no-multiple-empty-lines': 'warn',
    'style/no-trailing-spaces': 'warn',
    // Import cleanup
    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': 'warn',
    // Regexp rules
    'regexp/negation': 'warn',
    'regexp/no-misleading-capturing-group': 'warn',
    'regexp/no-super-linear-backtracking': 'warn', // heuristic, has false positives in regex-heavy code
    'regexp/no-unused-capturing-group': 'warn', // context-aware but still has edge cases
    'regexp/no-useless-assertions': 'warn',
    'regexp/no-useless-lazy': 'warn',
    'regexp/no-useless-non-capturing-group': 'warn',
    'regexp/optimal-quantifier-concatenation': 'warn',
    'regexp/prefer-character-class': 'warn',
    'regexp/prefer-w': 'warn',
    'regexp/strict': 'warn',
    'regexp/use-ignore-case': 'warn',
    // Other rules
    'no-new': 'warn',
    'no-regex-spaces': 'error',
    'node/prefer-global/buffer': 'warn',
    'node/prefer-global/process': 'warn',
    'perfectionist/sort-imports': 'off', // too opinionated for this codebase
    'prefer-template': 'warn',
  },
}

export default config
