/**
 * Benchmark Comparison Report Generator
 * Generates comparison tables and detailed breakdowns
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, group, run } from 'mitata'
import { runLintProgrammatic } from '../../packages/pickier/src/index'
import * as prettier from 'prettier'

// Load fixtures
const fixtures = {
  small: resolve(__dirname, '../fixtures/small.ts'),
  medium: resolve(__dirname, '../fixtures/medium.ts'),
  large: resolve(__dirname, '../fixtures/large.ts'),
}

const fixtureContent = {
  small: readFileSync(fixtures.small, 'utf-8'),
  medium: readFileSync(fixtures.medium, 'utf-8'),
  large: readFileSync(fixtures.large, 'utf-8'),
}

// Get fixture stats
const stats = {
  small: {
    lines: fixtureContent.small.split('\n').length,
    size: Buffer.byteLength(fixtureContent.small, 'utf8'),
    chars: fixtureContent.small.length,
  },
  medium: {
    lines: fixtureContent.medium.split('\n').length,
    size: Buffer.byteLength(fixtureContent.medium, 'utf8'),
    chars: fixtureContent.medium.length,
  },
  large: {
    lines: fixtureContent.large.split('\n').length,
    size: Buffer.byteLength(fixtureContent.large, 'utf8'),
    chars: fixtureContent.large.length,
  },
}

console.log(`\n${'='.repeat(100)}`)
console.log('                         PICKIER PERFORMANCE BENCHMARK COMPARISON')
console.log('='.repeat(100))
console.log('\n📊 Test Fixtures:\n')
console.log('┌─────────┬────────────┬──────────────┬──────────────┐')
console.log('│  Size   │   Lines    │     Bytes    │  Characters  │')
console.log('├─────────┼────────────┼──────────────┼──────────────┤')
console.log(`│ Small   │ ${stats.small.lines.toString().padStart(10)} │ ${stats.small.size.toString().padStart(12)} │ ${stats.small.chars.toString().padStart(12)} │`)
console.log(`│ Medium  │ ${stats.medium.lines.toString().padStart(10)} │ ${stats.medium.size.toString().padStart(12)} │ ${stats.medium.chars.toString().padStart(12)} │`)
console.log(`│ Large   │ ${stats.large.lines.toString().padStart(10)} │ ${stats.large.size.toString().padStart(12)} │ ${stats.large.chars.toString().padStart(12)} │`)
console.log('└─────────┴────────────┴──────────────┴──────────────┘')

console.log(`\n${'='.repeat(100)}`)
console.log('                               LINTING BENCHMARKS')
console.log(`${'='.repeat(100)}\n`)

// Linting comparison - Small files
group('📦 Small File Linting (~50 lines)', () => {
  bench('Pickier', async () => {
    await runLintProgrammatic([fixtures.small], { reporter: 'json' })
  })

  bench('ESLint', async () => {
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
    await eslint.lintFiles([fixtures.small])
  })
})

// Linting comparison - Medium files
group('📦 Medium File Linting (~500 lines)', () => {
  bench('Pickier', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })

  bench('ESLint', async () => {
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

// Linting comparison - Large files
group('📦 Large File Linting (~2000 lines)', () => {
  bench('Pickier', async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
  })

  bench('ESLint', async () => {
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
    await eslint.lintFiles([fixtures.large])
  })
})

console.log(`\n${'='.repeat(100)}`)
console.log('                              FORMATTING BENCHMARKS')
console.log(`${'='.repeat(100)}\n`)

// Formatting comparison - Small files
group('✨ Small File Formatting (~50 lines)', () => {
  bench('Pickier', async () => {
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.small], { write: false })
    }
  })

  bench('Prettier', async () => {
    await prettier.format(fixtureContent.small, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })
})

// Formatting comparison - Medium files
group('✨ Medium File Formatting (~500 lines)', () => {
  bench('Pickier', async () => {
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.medium], { write: false })
    }
  })

  bench('Prettier', async () => {
    await prettier.format(fixtureContent.medium, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })
})

// Formatting comparison - Large files
group('✨ Large File Formatting (~2000 lines)', () => {
  bench('Pickier', async () => {
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.large], { write: false })
    }
  })

  bench('Prettier', async () => {
    await prettier.format(fixtureContent.large, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })
})

console.log(`\n${'='.repeat(100)}`)
console.log('                           COMBINED WORKFLOW BENCHMARKS')
console.log(`${'='.repeat(100)}\n`)

// Combined workflow - Small files
group('🔄 Small File: Lint + Format (~50 lines)', () => {
  bench('Pickier (combined)', async () => {
    await runLintProgrammatic([fixtures.small], { reporter: 'json' })
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.small], { write: false })
    }
  })

  bench('ESLint + Prettier', async () => {
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
    await eslint.lintFiles([fixtures.small])
    await prettier.format(fixtureContent.small, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })
})

// Combined workflow - Medium files
group('🔄 Medium File: Lint + Format (~500 lines)', () => {
  bench('Pickier (combined)', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.medium], { write: false })
    }
  })

  bench('ESLint + Prettier', async () => {
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
    await prettier.format(fixtureContent.medium, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })
})

// Combined workflow - Large files
group('🔄 Large File: Lint + Format (~2000 lines)', () => {
  bench('Pickier (combined)', async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.large], { write: false })
    }
  })

  bench('ESLint + Prettier', async () => {
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
    await eslint.lintFiles([fixtures.large])
    await prettier.format(fixtureContent.large, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })
})

console.log(`\n${'='.repeat(100)}`)
console.log('                              THROUGHPUT BENCHMARKS')
console.log(`${'='.repeat(100)}\n`)

// Throughput measurements
group('📈 Throughput: Lines Per Second', () => {
  bench(`Pickier (${stats.small.lines} lines)`, async () => {
    await runLintProgrammatic([fixtures.small], { reporter: 'json' })
  })

  bench(`Pickier (${stats.medium.lines} lines)`, async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })

  bench(`Pickier (${stats.large.lines} lines)`, async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
  })
})

// Batch processing
group('📈 Batch Processing: All Files', () => {
  bench('Pickier (sequential)', async () => {
    for (const file of Object.values(fixtures)) {
      await runLintProgrammatic([file], { reporter: 'json' })
    }
  })

  bench('Pickier (parallel)', async () => {
    await Promise.all(
      Object.values(fixtures).map(file =>
        runLintProgrammatic([file], { reporter: 'json' }),
      ),
    )
  })

  bench('ESLint (sequential)', async () => {
    const { ESLint } = await import('eslint')
    for (const file of Object.values(fixtures)) {
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
      await eslint.lintFiles([file])
    }
  })
})

await run({
  format: 'mitata',
  colors: true,
})

console.log(`\n${'='.repeat(100)}`)
console.log('                           BENCHMARK SUMMARY')
console.log('='.repeat(100))
console.log('\n✅ All benchmarks completed successfully!')
console.log('\n📊 Key Metrics:')
console.log('   • Operations per second (ops/sec): Higher is better')
console.log('   • Average time (ms): Lower is better')
console.log('   • Margin of error: Lower indicates more consistent results')
console.log('\n🎯 File Sizes:')
console.log(`   • Small:  ${stats.small.lines} lines (${(stats.small.size / 1024).toFixed(2)} KB)`)
console.log(`   • Medium: ${stats.medium.lines} lines (${(stats.medium.size / 1024).toFixed(2)} KB)`)
console.log(`   • Large:  ${stats.large.lines} lines (${(stats.large.size / 1024).toFixed(2)} KB)`)
console.log(`\n${'='.repeat(100)}\n`)
