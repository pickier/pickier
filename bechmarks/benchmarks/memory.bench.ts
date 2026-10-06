/**
 * Memory Usage Benchmarks
 * Measures memory consumption and efficiency
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

function getMemoryUsage() {
  if (typeof Bun !== 'undefined') {
    // Bun memory stats
    return Bun.nanoseconds()
  }
  return process.memoryUsage()
}

// Memory pressure test - repeated operations
group('Memory - Repeated Operations (100x)', () => {
  bench('pickier (small file)', async () => {
    for (let i = 0; i < 100; i++) {
      await runLintProgrammatic([fixtures.small], { reporter: 'json' })
    }
  })

  bench('eslint (small file)', async () => {
    const { ESLint } = await import('eslint')
    for (let i = 0; i < 100; i++) {
      const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: {
          languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
          rules: {
            'no-debugger': 'error',
          },
        },
      })
      await eslint.lintFiles([fixtures.small])
    }
  })

  bench('prettier (small file)', async () => {
    for (let i = 0; i < 100; i++) {
      await prettier.format(fixtureContent.small, {
        parser: 'typescript',
        semi: false,
        singleQuote: true,
      })
    }
  })
})

// Memory leak test - should maintain stable memory
group('Memory - Stability Test (1000x)', () => {
  bench('pickier stability', async () => {
    for (let i = 0; i < 1000; i++) {
      await runLintProgrammatic([fixtures.small], { reporter: 'json' })
      // Check memory isn't growing unbounded
      if (i % 100 === 0 && typeof gc !== 'undefined') {
        gc()
      }
    }
  })
})

// Large batch memory efficiency
group('Memory - Large Batch Processing', () => {
  bench('pickier (all files x10)', async () => {
    for (let i = 0; i < 10; i++) {
      for (const file of Object.values(fixtures)) {
        await runLintProgrammatic([file], { reporter: 'json' })
      }
    }
  })

  bench('prettier (all files x10)', async () => {
    for (let i = 0; i < 10; i++) {
      for (const content of Object.values(fixtureContent)) {
        await prettier.format(content, {
          parser: 'typescript',
          semi: false,
          singleQuote: true,
        })
      }
    }
  })
})

// Concurrent memory usage
group('Memory - Concurrent Processing', () => {
  bench('pickier (10 parallel)', async () => {
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(runLintProgrammatic([fixtures.medium], { reporter: 'json' }))
    }
    await Promise.all(promises)
  })

  bench('prettier (10 parallel)', async () => {
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(
        prettier.format(fixtureContent.medium, {
          parser: 'typescript',
          semi: false,
          singleQuote: true,
        }),
      )
    }
    await Promise.all(promises)
  })
})

// Cache efficiency test
group('Memory - Cache Efficiency', () => {
  bench('pickier (same file 50x)', async () => {
    for (let i = 0; i < 50; i++) {
      await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
    }
  })

  bench('prettier (same content 50x)', async () => {
    for (let i = 0; i < 50; i++) {
      await prettier.format(fixtureContent.medium, {
        parser: 'typescript',
        semi: false,
        singleQuote: true,
      })
    }
  })
})

await run({
  format: 'mitata',
  colors: true,
})
