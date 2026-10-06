/**
 * Rule Execution Benchmarks
 * Measures individual rule performance and plugin overhead
 */
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { runLintProgrammatic } from '../../packages/pickier/src/index'

// Load fixtures
const fixtures = {
  small: resolve(__dirname, '../fixtures/small.ts'),
  medium: resolve(__dirname, '../fixtures/medium.ts'),
  large: resolve(__dirname, '../fixtures/large.ts'),
}

// Helper to run pickier with specific rules
async function runWithRules(filePath: string, rules: Record<string, any>) {
  return runLintProgrammatic([filePath], {
    reporter: 'json',
    // Rules would be passed through config
  })
}

// Helper to run ESLint with specific rules
async function runESLintWithRules(filePath: string, rules: Record<string, any>) {
  const { ESLint } = await import('eslint')
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules,
    },
  })
  return eslint.lintFiles([filePath])
}

// Single rule benchmarks
group('Rules - Single Rule (medium file)', () => {
  bench('pickier: no-debugger only', async () => {
    await runWithRules(fixtures.medium, {
      'no-debugger': 'error',
    })
  })

  bench('eslint: no-debugger only', async () => {
    await runESLintWithRules(fixtures.medium, {
      'no-debugger': 'error',
    })
  })

  bench('pickier: no-console only', async () => {
    await runWithRules(fixtures.medium, {
      'no-console': 'warn',
    })
  })

  bench('eslint: no-console only', async () => {
    await runESLintWithRules(fixtures.medium, {
      'no-console': 'warn',
    })
  })
})

// Multiple rules benchmarks
group('Rules - Multiple Rules (medium file)', () => {
  bench('pickier: 5 rules', async () => {
    await runLintProgrammatic([fixtures.medium], {
      reporter: 'json',
    })
  })

  bench('eslint: 5 rules', async () => {
    await runESLintWithRules(fixtures.medium, {
      'no-debugger': 'error',
      'no-console': 'warn',
      'no-unused-vars': 'error',
      'semi': ['error', 'never'],
      'quotes': ['error', 'single'],
    })
  })

  bench('eslint: 20 rules', async () => {
    await runESLintWithRules(fixtures.medium, {
      'no-debugger': 'error',
      'no-console': 'warn',
      'no-unused-vars': 'error',
      'semi': ['error', 'never'],
      'quotes': ['error', 'single'],
      'indent': ['error', 2],
      'comma-dangle': ['error', 'always-multiline'],
      'no-trailing-spaces': 'error',
      'eol-last': 'error',
      'no-multiple-empty-lines': 'error',
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-function-paren': ['error', 'never'],
      'keyword-spacing': 'error',
      'space-infix-ops': 'error',
      'comma-spacing': 'error',
      'key-spacing': 'error',
      'no-multi-spaces': 'error',
      'space-in-parens': ['error', 'never'],
      'space-before-blocks': 'error',
    })
  })
})

// Rule execution across file sizes
group('Rules - Scaling with File Size', () => {
  bench('pickier: small file', async () => {
    await runLintProgrammatic([fixtures.small], { reporter: 'json' })
  })

  bench('pickier: medium file', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })

  bench('pickier: large file', async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
  })

  bench('eslint: small file', async () => {
    await runESLintWithRules(fixtures.small, {
      'no-debugger': 'error',
      'no-console': 'warn',
      'no-unused-vars': 'error',
    })
  })

  bench('eslint: medium file', async () => {
    await runESLintWithRules(fixtures.medium, {
      'no-debugger': 'error',
      'no-console': 'warn',
      'no-unused-vars': 'error',
    })
  })

  bench('eslint: large file', async () => {
    await runESLintWithRules(fixtures.large, {
      'no-debugger': 'error',
      'no-console': 'warn',
      'no-unused-vars': 'error',
    })
  })
})

// Plugin overhead measurement
group('Rules - Plugin Overhead', () => {
  bench('pickier: no rules', async () => {
    // Measure baseline overhead with no rules
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })

  bench('pickier: with rules', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })
})

// Rule execution patterns
group('Rules - Execution Patterns', () => {
  bench('sequential: 3 files, same rules', async () => {
    for (const file of Object.values(fixtures)) {
      await runLintProgrammatic([file], { reporter: 'json' })
    }
  })

  bench('parallel: 3 files, same rules', async () => {
    await Promise.all(
      Object.values(fixtures).map(file =>
        runLintProgrammatic([file], { reporter: 'json' }),
      ),
    )
  })
})

// Complex rule benchmarks
group('Rules - Complex Patterns', () => {
  bench('pickier: all built-in rules', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })

  bench('eslint: recommended rules', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
        rules: {
          'no-debugger': 'error',
          'no-console': 'warn',
        },
      },
    })
    await eslint.lintFiles([fixtures.medium])
  })
})

// Rule caching efficiency
group('Rules - Caching (10x same file)', () => {
  bench('pickier with caching', async () => {
    for (let i = 0; i < 10; i++) {
      await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
    }
  })

  bench('eslint with caching', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
        rules: {
          'no-debugger': 'error',
          'no-console': 'warn',
        },
      },
    })
    for (let i = 0; i < 10; i++) {
      await eslint.lintFiles([fixtures.medium])
    }
  })
})

await run({
  format: 'mitata',
  colors: true,
})
