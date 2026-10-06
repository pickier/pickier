/**
 * Size-Specific Breakdown Report
 * Detailed analysis by file size with performance characteristics
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

// Calculate detailed stats
function getDetailedStats(content: string) {
  const lines = content.split('\n')
  return {
    totalLines: lines.length,
    codeLines: lines.filter(l => l.trim() && !l.trim().startsWith('//')).length,
    commentLines: lines.filter(l => l.trim().startsWith('//')).length,
    blankLines: lines.filter(l => !l.trim()).length,
    bytes: Buffer.byteLength(content, 'utf8'),
    chars: content.length,
    imports: lines.filter(l => l.includes('import')).length,
    exports: lines.filter(l => l.includes('export')).length,
    functions: (content.match(/function\s+\w+/g) || []).length,
    classes: (content.match(/class\s+\w+/g) || []).length,
    interfaces: (content.match(/interface\s+\w+/g) || []).length,
  }
}

const smallStats = getDetailedStats(fixtureContent.small)
const mediumStats = getDetailedStats(fixtureContent.medium)
const largeStats = getDetailedStats(fixtureContent.large)

console.log(`\n${'='.repeat(120)}`)
console.log('                                  FILE SIZE BREAKDOWN ANALYSIS')
console.log('='.repeat(120))

console.log('\n📄 SMALL FILE ANALYSIS (~50 lines)')
console.log('─'.repeat(120))
console.log('┌─────────────────────┬──────────┐')
console.log('│ Metric              │  Value   │')
console.log('├─────────────────────┼──────────┤')
console.log(`│ Total Lines         │ ${smallStats.totalLines.toString().padStart(8)} │`)
console.log(`│ Code Lines          │ ${smallStats.codeLines.toString().padStart(8)} │`)
console.log(`│ Comment Lines       │ ${smallStats.commentLines.toString().padStart(8)} │`)
console.log(`│ Blank Lines         │ ${smallStats.blankLines.toString().padStart(8)} │`)
console.log(`│ File Size (bytes)   │ ${smallStats.bytes.toString().padStart(8)} │`)
console.log(`│ Characters          │ ${smallStats.chars.toString().padStart(8)} │`)
console.log(`│ Import Statements   │ ${smallStats.imports.toString().padStart(8)} │`)
console.log(`│ Export Statements   │ ${smallStats.exports.toString().padStart(8)} │`)
console.log(`│ Functions           │ ${smallStats.functions.toString().padStart(8)} │`)
console.log(`│ Classes             │ ${smallStats.classes.toString().padStart(8)} │`)
console.log(`│ Interfaces          │ ${smallStats.interfaces.toString().padStart(8)} │`)
console.log('└─────────────────────┴──────────┘')

console.log('\n📄 MEDIUM FILE ANALYSIS (~500 lines)')
console.log('─'.repeat(120))
console.log('┌─────────────────────┬──────────┐')
console.log('│ Metric              │  Value   │')
console.log('├─────────────────────┼──────────┤')
console.log(`│ Total Lines         │ ${mediumStats.totalLines.toString().padStart(8)} │`)
console.log(`│ Code Lines          │ ${mediumStats.codeLines.toString().padStart(8)} │`)
console.log(`│ Comment Lines       │ ${mediumStats.commentLines.toString().padStart(8)} │`)
console.log(`│ Blank Lines         │ ${mediumStats.blankLines.toString().padStart(8)} │`)
console.log(`│ File Size (bytes)   │ ${mediumStats.bytes.toString().padStart(8)} │`)
console.log(`│ Characters          │ ${mediumStats.chars.toString().padStart(8)} │`)
console.log(`│ Import Statements   │ ${mediumStats.imports.toString().padStart(8)} │`)
console.log(`│ Export Statements   │ ${mediumStats.exports.toString().padStart(8)} │`)
console.log(`│ Functions           │ ${mediumStats.functions.toString().padStart(8)} │`)
console.log(`│ Classes             │ ${mediumStats.classes.toString().padStart(8)} │`)
console.log(`│ Interfaces          │ ${mediumStats.interfaces.toString().padStart(8)} │`)
console.log('└─────────────────────┴──────────┘')

console.log('\n📄 LARGE FILE ANALYSIS (~2000 lines)')
console.log('─'.repeat(120))
console.log('┌─────────────────────┬──────────┐')
console.log('│ Metric              │  Value   │')
console.log('├─────────────────────┼──────────┤')
console.log(`│ Total Lines         │ ${largeStats.totalLines.toString().padStart(8)} │`)
console.log(`│ Code Lines          │ ${largeStats.codeLines.toString().padStart(8)} │`)
console.log(`│ Comment Lines       │ ${largeStats.commentLines.toString().padStart(8)} │`)
console.log(`│ Blank Lines         │ ${largeStats.blankLines.toString().padStart(8)} │`)
console.log(`│ File Size (bytes)   │ ${largeStats.bytes.toString().padStart(8)} │`)
console.log(`│ Characters          │ ${largeStats.chars.toString().padStart(8)} │`)
console.log(`│ Import Statements   │ ${largeStats.imports.toString().padStart(8)} │`)
console.log(`│ Export Statements   │ ${largeStats.exports.toString().padStart(8)} │`)
console.log(`│ Functions           │ ${largeStats.functions.toString().padStart(8)} │`)
console.log(`│ Classes             │ ${largeStats.classes.toString().padStart(8)} │`)
console.log(`│ Interfaces          │ ${largeStats.interfaces.toString().padStart(8)} │`)
console.log('└─────────────────────┴──────────┘')

console.log(`\n${'='.repeat(120)}`)
console.log('                              PERFORMANCE BY FILE SIZE')
console.log(`${'='.repeat(120)}\n`)

// Small file performance
group('🔬 Small File Performance Deep Dive', () => {
  bench('Pickier: Lint only', async () => {
    await runLintProgrammatic([fixtures.small], { reporter: 'json' })
  })

  bench('Pickier: Format only', async () => {
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.small], { write: false })
    }
  })

  bench('Pickier: Lint + Format', async () => {
    await runLintProgrammatic([fixtures.small], { reporter: 'json' })
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.small], { write: false })
    }
  })

  bench('ESLint: Lint only', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'no-debugger': 'error', 'no-console': 'warn' },
      },
    })
    await eslint.lintFiles([fixtures.small])
  })

  bench('Prettier: Format only', async () => {
    await prettier.format(fixtureContent.small, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })

  bench('ESLint + Prettier: Combined', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'no-debugger': 'error', 'no-console': 'warn' },
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

// Medium file performance
group('🔬 Medium File Performance Deep Dive', () => {
  bench('Pickier: Lint only', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })

  bench('Pickier: Format only', async () => {
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.medium], { write: false })
    }
  })

  bench('Pickier: Lint + Format', async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.medium], { write: false })
    }
  })

  bench('ESLint: Lint only', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'no-debugger': 'error', 'no-console': 'warn' },
      },
    })
    await eslint.lintFiles([fixtures.medium])
  })

  bench('Prettier: Format only', async () => {
    await prettier.format(fixtureContent.medium, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })

  bench('ESLint + Prettier: Combined', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'no-debugger': 'error', 'no-console': 'warn' },
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

// Large file performance
group('🔬 Large File Performance Deep Dive', () => {
  bench('Pickier: Lint only', async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
  })

  bench('Pickier: Format only', async () => {
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.large], { write: false })
    }
  })

  bench('Pickier: Lint + Format', async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
    const pickier = await import('pickier')
    if ('runFormat' in pickier) {
      await pickier.runFormat([fixtures.large], { write: false })
    }
  })

  bench('ESLint: Lint only', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'no-debugger': 'error', 'no-console': 'warn' },
      },
    })
    await eslint.lintFiles([fixtures.large])
  })

  bench('Prettier: Format only', async () => {
    await prettier.format(fixtureContent.large, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
    })
  })

  bench('ESLint + Prettier: Combined', async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'no-debugger': 'error', 'no-console': 'warn' },
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

// Scaling analysis
group('📊 Scaling Analysis: Performance vs Size', () => {
  bench(`Small (${smallStats.totalLines} lines)`, async () => {
    await runLintProgrammatic([fixtures.small], { reporter: 'json' })
  })

  bench(`Medium (${mediumStats.totalLines} lines)`, async () => {
    await runLintProgrammatic([fixtures.medium], { reporter: 'json' })
  })

  bench(`Large (${largeStats.totalLines} lines)`, async () => {
    await runLintProgrammatic([fixtures.large], { reporter: 'json' })
  })
})

await run({
  format: 'mitata',
  colors: true,
})

console.log(`\n${'='.repeat(120)}`)
console.log('                                 SCALING CHARACTERISTICS')
console.log('='.repeat(120))
console.log('\n📈 Complexity Scaling:')
console.log(`   Small → Medium:  ${(mediumStats.totalLines / smallStats.totalLines).toFixed(2)}x lines`)
console.log(`   Medium → Large:  ${(largeStats.totalLines / mediumStats.totalLines).toFixed(2)}x lines`)
console.log(`   Small → Large:   ${(largeStats.totalLines / smallStats.totalLines).toFixed(2)}x lines`)
console.log('\n💾 Size Scaling:')
console.log(`   Small → Medium:  ${(mediumStats.bytes / smallStats.bytes).toFixed(2)}x bytes`)
console.log(`   Medium → Large:  ${(largeStats.bytes / mediumStats.bytes).toFixed(2)}x bytes`)
console.log(`   Small → Large:   ${(largeStats.bytes / smallStats.bytes).toFixed(2)}x bytes`)
console.log('\n🏗️  Code Density:')
console.log(`   Small:   ${((smallStats.codeLines / smallStats.totalLines) * 100).toFixed(1)}% code`)
console.log(`   Medium:  ${((mediumStats.codeLines / mediumStats.totalLines) * 100).toFixed(1)}% code`)
console.log(`   Large:   ${((largeStats.codeLines / largeStats.totalLines) * 100).toFixed(1)}% code`)
console.log(`\n${'='.repeat(120)}\n`)
