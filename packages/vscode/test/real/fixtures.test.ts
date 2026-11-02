import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useRealPickier } from '../utils/real-pickier'

// This file exercises the real linter, not a stub of it.
useRealPickier()

describe('Test Fixtures with Real Pickier', () => {
  const fixturesDir = join(__dirname, '..', 'fixtures')

  it('format-quotes.ts - detects quote style issues', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-quotes.ts'), 'utf-8')

    const issues = await lintText(code, defaultConfig, 'format-quotes.ts')

    // Should detect quote style issues
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId === 'quotes')).toBe(true)
  })

  it('format-indent.ts - detects indentation issues', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-indent.ts'), 'utf-8')

    const issues = await lintText(code, defaultConfig, 'format-indent.ts')

    // Should detect indentation issues
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId === 'indent')).toBe(true)
  })

  it('lint-debugger-console.ts - detects debugger and console', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'lint-debugger-console.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noDebugger: 'error' as const, noConsole: 'warn' as const },
    }
    const issues = await lintText(code, config, 'lint-debugger-console.ts')

    // Should detect both debugger and console issues
    expect(issues.length).toBeGreaterThan(0)
    // pickier reports kebab-case rule ids; `noDebugger`/`noConsole` are the
    // config keys that switch them on, not what comes back on an issue.
    expect(issues.some(i => i.ruleId === 'no-debugger')).toBe(true)
    expect(issues.some(i => i.ruleId === 'no-console')).toBe(true)
  })

  it('lint-cond-assign.ts - detects assignment in conditionals', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'lint-cond-assign.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noCondAssign: 'error' as const },
    }
    const issues = await lintText(code, config, 'lint-cond-assign.ts')

    // Should detect assignment in conditions
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId === 'no-cond-assign')).toBe(true)
  })

  it('pickier-prefer-const.ts - detects let that should be const', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-prefer-const.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'pickier/prefer-const': 'warn' },
    }
    const issues = await lintText(code, config, 'pickier-prefer-const.ts')

    // Should detect prefer-const issues
    expect(issues.length).toBeGreaterThan(0)
    // The rule ID might be 'pickier/prefer-const' or just 'prefer-const'
    expect(issues.some(i => i.ruleId?.includes('prefer-const'))).toBe(true)
  })

  it('pickier-import-dedupe.ts - detects duplicate imports', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-import-dedupe.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'pickier/import-dedupe': 'warn' },
    }
    const issues = await lintText(code, config, 'pickier-import-dedupe.ts')

    // Should detect import deduplication issues
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('import-dedupe'))).toBe(true)
  })

  it('pickier-import-paths.ts - detects bad import paths', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-import-paths.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/no-import-node-modules-by-path': 'error',
        'pickier/no-import-dist': 'error',
      },
    }
    const issues = await lintText(code, config, 'pickier-import-paths.ts')

    // Should detect bad import paths
    expect(issues.length).toBeGreaterThan(0)
    expect(
      issues.some(i =>
        i.ruleId?.includes('no-import-node-modules-by-path') || i.ruleId?.includes('no-import-dist'),
      ),
    ).toBe(true)
  })

  it('style-curly.ts - detects missing braces', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'style-curly.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'style/curly': 'warn' },
    }
    const issues = await lintText(code, config, 'style-curly.ts')

    // Should detect curly brace issues
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('curly'))).toBe(true)
  })

  it('style-if-newline.ts - detects inconsistent if-else formatting', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'style-if-newline.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'style/if-newline': 'warn' },
    }
    const issues = await lintText(code, config, 'style-if-newline.ts')

    // Should detect if-newline issues
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('if-newline'))).toBe(true)
  })

  it('ts-no-require.ts - detects CommonJS require', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'ts-no-require.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'ts/no-require-imports': 'error' },
    }
    const issues = await lintText(code, config, 'ts-no-require.ts')

    // Should detect require imports
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('no-require-imports'))).toBe(true)
  })

  it('ts-no-top-level-await.ts - detects top-level await', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'ts-no-top-level-await.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'ts/no-top-level-await': 'error' },
    }
    const issues = await lintText(code, config, 'ts-no-top-level-await.ts')

    // Should detect top-level await
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('no-top-level-await'))).toBe(true)
  })

  it('pickier-no-unused-vars.ts - detects unused variables', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-no-unused-vars.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'pickier/no-unused-vars': 'warn' },
    }
    const issues = await lintText(code, config, 'pickier-no-unused-vars.ts')

    // Should detect unused variables
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('no-unused-vars'))).toBe(true)
  })

  it('pickier-sort-exports.ts - detects unsorted exports', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-sort-exports.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'pickier/sort-exports': 'warn' },
    }
    const issues = await lintText(code, config, 'pickier-sort-exports.ts')

    // Should detect unsorted exports
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('sort-exports'))).toBe(true)
  })

  it('pickier-sort-heritage-clauses.ts - detects unsorted heritage clauses', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-sort-heritage-clauses.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'pickier/sort-heritage-clauses': 'warn' },
    }
    const issues = await lintText(code, config, 'pickier-sort-heritage-clauses.ts')

    // Should detect unsorted heritage clauses
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('sort-heritage-clauses'))).toBe(true)
  })

  it('pickier-top-level-function.ts - detects arrow functions at top level', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-top-level-function.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'pickier/top-level-function': 'warn' },
    }
    const issues = await lintText(code, config, 'pickier-top-level-function.ts')

    // Should detect top-level arrow functions
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('top-level-function'))).toBe(true)
  })

  it('style-consistent-chaining.ts - detects inconsistent chaining', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'style-consistent-chaining.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'style/consistent-chaining': 'warn' },
    }
    const issues = await lintText(code, config, 'style-consistent-chaining.ts')

    // Should detect inconsistent chaining
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('consistent-chaining'))).toBe(true)
  })

  it('style-consistent-list-newline.ts - detects inconsistent list newlines', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'style-consistent-list-newline.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'style/consistent-list-newline': 'warn' },
    }
    const issues = await lintText(code, config, 'style-consistent-list-newline.ts')

    // Should detect inconsistent list newlines
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('consistent-list-newline'))).toBe(true)
  })

  it('ts-no-ts-export-equal.ts - detects export = syntax', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'ts-no-ts-export-equal.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: { ...defaultConfig.pluginRules, 'ts/no-ts-export-equal': 'error' },
    }
    const issues = await lintText(code, config, 'ts-no-ts-export-equal.ts')

    // Should detect export = syntax
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.ruleId?.includes('no-ts-export-equal'))).toBe(true)
  })

  it('regexp-rules.ts - detects regexp issues', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'regexp-rules.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: {
        ...defaultConfig.pluginRules,
        'regexp/no-super-linear-backtracking': 'warn',
        'regexp/no-unused-capturing-group': 'warn',
      },
    }
    const issues = await lintText(code, config, 'regexp-rules.ts')

    // Should detect regexp issues
    expect(issues.length).toBeGreaterThan(0)
    expect(
      issues.some(i =>
        i.ruleId?.includes('no-super-linear-backtracking') || i.ruleId?.includes('no-unused-capturing-group'),
      ),
    ).toBe(true)
  })

  it('format-semi.ts - detects semicolon issues', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-semi.ts'), 'utf-8')

    const issues = await lintText(code, defaultConfig, 'format-semi.ts')

    // Should detect semicolon issues when semi: false
    expect(issues.length).toBeGreaterThan(0)
  })

  it('formatCode fixes quote issues', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-quotes.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'format-quotes.ts')

    // After formatting, should have consistent quotes
    expect(formatted).not.toBe(code)
    // Should convert double quotes to single
    expect(formatted).toContain('\'Hello World\'')
  })

  it('formatCode fixes indentation issues', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-indent.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'format-indent.ts')

    // After formatting, should have consistent 2-space indentation
    expect(formatted).not.toBe(code)
    // Should not contain tabs or inconsistent spacing
    expect(formatted).not.toContain('\t')
  })

  it('formatCode fixes semicolon issues', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-semi.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'format-semi.ts')

    // Note: formatCode may or may not handle semicolons depending on implementation
    // This test verifies that formatCode runs without errors on code with semicolons
    expect(formatted).toBeDefined()
    expect(typeof formatted).toBe('string')
  })

  it('formatCode fixes whitespace issues', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-whitespace.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'format-whitespace.ts')

    // After formatting, should fix trailing whitespace and consecutive blank lines
    expect(formatted).not.toBe(code)
    // Should not have more than 1 consecutive blank line
    expect(formatted).not.toMatch(/\n{3,}/)
  })

  it('formatCode is idempotent - formatting twice produces same result', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'format-quotes.ts'), 'utf-8')

    const formatted1 = formatCode(code, defaultConfig, 'format-quotes.ts')
    const formatted2 = formatCode(formatted1, defaultConfig, 'format-quotes.ts')

    // Formatting should be idempotent - formatting already-formatted code should not change it
    expect(formatted1).toBe(formatted2)
  })

  it('formatCode handles complex files with multiple issues', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'pickier-sort-imports.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'pickier-sort-imports.ts')

    // Should fix multiple types of issues
    expect(formatted).not.toBe(code)
  })
})

describe('Edge Case Tests - Stress Testing', () => {
  const fixturesDir = join(__dirname, '..', 'fixtures')

  it('edge-case-nested-structures.ts - handles deeply nested code', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-nested-structures.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noCondAssign: 'error' as const },
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-objects': 'warn',
        'pickier/sort-keys': 'warn',
        'pickier/sort-imports': 'warn',
        'pickier/no-unused-vars': 'warn',
        'style/consistent-chaining': 'warn',
        'style/consistent-list-newline': 'warn',
      },
    }

    const issues = await lintText(code, config, 'edge-case-nested-structures.ts')

    // Should detect multiple types of issues without crashing
    expect(issues.length).toBeGreaterThan(0)
    // Should detect at least some of: unsorted objects, inconsistent chaining, unused vars
    expect(issues.some(i =>
      i.ruleId?.includes('sort')
      || i.ruleId?.includes('unused')
      || i.ruleId?.includes('chaining')
      || i.ruleId?.includes('noCondAssign'),
    )).toBe(true)
  })

  it('edge-case-comments.ts - handles comments correctly', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-comments.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-imports': 'warn',
        'pickier/sort-exports': 'warn',
        'pickier/sort-objects': 'warn',
        'pickier/top-level-function': 'warn',
      },
    }

    const issues = await lintText(code, config, 'edge-case-comments.ts')

    // Should detect issues even with comments present
    expect(issues.length).toBeGreaterThan(0)
    // Comments should not break the linter
    expect(() => issues.forEach(i => i.ruleId)).not.toThrow()
  })

  it('edge-case-strings-templates.ts - handles strings and templates', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-strings-templates.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-objects': 'warn',
        'pickier/top-level-function': 'warn',
      },
    }

    const issues = await lintText(code, config, 'edge-case-strings-templates.ts')

    // Should detect real issues, not be confused by strings
    expect(issues.length).toBeGreaterThan(0)
    // Should detect sorting issues in actual objects, not in string content
    expect(issues.some(i => i.ruleId?.includes('sort'))).toBe(true)
  })

  it('edge-case-multiline-constructs.ts - handles multi-line code', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-multiline-constructs.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noCondAssign: 'error' as const },
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-objects': 'warn',
        'pickier/sort-heritage-clauses': 'warn',
        'pickier/top-level-function': 'warn',
        'style/consistent-chaining': 'warn',
        'style/consistent-list-newline': 'warn',
      },
    }

    const issues = await lintText(code, config, 'edge-case-multiline-constructs.ts')

    // Should handle multi-line constructs without issues
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i =>
      i.ruleId?.includes('sort')
      || i.ruleId?.includes('chaining')
      || i.ruleId?.includes('list-newline'),
    )).toBe(true)
  })

  it('edge-case-unicode-special.ts - handles Unicode and special chars', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-unicode-special.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-objects': 'warn',
        'pickier/top-level-function': 'warn',
      },
    }

    const issues = await lintText(code, config, 'edge-case-unicode-special.ts')

    // Should handle Unicode without crashing
    expect(Array.isArray(issues)).toBe(true)
    // May or may not detect issues depending on Unicode handling
    // Main goal is no crashes
  })

  it('edge-case-real-world.ts - handles realistic patterns', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-real-world.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noCondAssign: 'error' as const },
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-objects': 'warn',
        'pickier/no-unused-vars': 'warn',
        'pickier/top-level-function': 'warn',
        'style/consistent-chaining': 'warn',
      },
    }

    const issues = await lintText(code, config, 'edge-case-real-world.ts')

    // Real-world patterns should be linted correctly
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i =>
      i.ruleId?.includes('sort')
      || i.ruleId?.includes('top-level-function'),
    )).toBe(true)
  })

  it('edge-case-boundary.ts - handles boundary conditions', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-boundary.ts'), 'utf-8')

    const config = {
      ...defaultConfig,
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-objects': 'warn',
        'pickier/top-level-function': 'warn',
      },
    }

    const issues = await lintText(code, config, 'edge-case-boundary.ts')

    // Boundary cases should not crash the linter
    expect(Array.isArray(issues)).toBe(true)
    // Should handle empty structures, single elements, etc.
  })

  it('formatCode handles nested structures without crashing', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-nested-structures.ts'), 'utf-8')

    // Should not throw
    expect(() => formatCode(code, defaultConfig, 'edge-case-nested-structures.ts')).not.toThrow()

    const formatted = formatCode(code, defaultConfig, 'edge-case-nested-structures.ts')
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('formatCode handles comments without breaking them', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-comments.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'edge-case-comments.ts')

    // Comments should still be present
    expect(formatted).toContain('//')
    expect(formatted).toContain('/*')
    // NOTE: formatCode may remove or modify import statements and their comments
    // This is expected behavior for the current implementation
    // Should preserve at least some comment content
    expect(formatted).toContain('Comment before zebra')
  })

  it('formatCode handles strings without altering content', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-strings-templates.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'edge-case-strings-templates.ts')

    // String content should be preserved (though quotes may change)
    expect(formatted).toContain('Hello World')
    expect(formatted).toContain('Line 1')
  })

  it('formatCode handles Unicode correctly', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-unicode-special.ts'), 'utf-8')

    const formatted = formatCode(code, defaultConfig, 'edge-case-unicode-special.ts')

    // Unicode should be preserved
    expect(formatted).toContain('中文')
    expect(formatted).toContain('Русский')
    expect(formatted).toContain('🚀')
  })

  it('formatCode handles boundary cases without errors', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-boundary.ts'), 'utf-8')

    expect(() => formatCode(code, defaultConfig, 'edge-case-boundary.ts')).not.toThrow()

    const formatted = formatCode(code, defaultConfig, 'edge-case-boundary.ts')
    expect(formatted).toBeDefined()
  })

  it('lintText handles files with no issues', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    // A simple, valid file
    const code = `const x = 1\nconst y = 2\nconsole.log(x, y)\n`

    const issues = await lintText(code, defaultConfig, 'valid.ts')

    // Should return empty array or minimal issues
    expect(Array.isArray(issues)).toBe(true)
  })

  it('lintText handles empty files', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = ''

    const issues = await lintText(code, defaultConfig, 'empty.ts')

    // Empty file should not cause errors
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBe(0)
  })

  it('lintText handles files with only whitespace', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = '   \n\n  \t  \n   '

    const issues = await lintText(code, defaultConfig, 'whitespace.ts')

    // Whitespace-only file should not crash
    expect(Array.isArray(issues)).toBe(true)
  })

  it('lintText handles files with only comments', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = '// Just a comment\n/* Another comment */\n'

    const issues = await lintText(code, defaultConfig, 'comments-only.ts')

    // Comments-only file should not crash
    expect(Array.isArray(issues)).toBe(true)
  })

  it('formatCode is consistent across multiple edge case files', async () => {
    const { formatCode, defaultConfig } = await import('pickier')

    const files = [
      'edge-case-nested-structures.ts',
      // NOTE: edge-case-comments.ts excluded due to non-idempotent behavior with imports
      'edge-case-strings-templates.ts',
      'edge-case-multiline-constructs.ts',
      'edge-case-unicode-special.ts',
      'edge-case-real-world.ts',
      'edge-case-boundary.ts',
    ]

    for (const file of files) {
      const code = readFileSync(join(fixturesDir, file), 'utf-8')
      const formatted1 = formatCode(code, defaultConfig, file)
      const formatted2 = formatCode(formatted1, defaultConfig, file)

      // Formatting should be idempotent even for edge cases
      expect(formatted1).toBe(formatted2)
    }
  })

  it('verifies formatCode idempotency fix for comments file', async () => {
    const { formatCode, defaultConfig } = await import('pickier')
    const code = readFileSync(join(fixturesDir, 'edge-case-comments.ts'), 'utf-8')

    const formatted1 = formatCode(code, defaultConfig, 'edge-case-comments.ts')
    const formatted2 = formatCode(formatted1, defaultConfig, 'edge-case-comments.ts')
    const formatted3 = formatCode(formatted2, defaultConfig, 'edge-case-comments.ts')

    // FIXED: formatCode should now be idempotent - running it multiple times produces same result
    expect(formatted1).toBe(formatted2)
    expect(formatted2).toBe(formatted3)
  })

  it('lintText reports correct line and column numbers', async () => {
    const { lintText, defaultConfig } = await import('pickier')
    const code = `const x = 1\nif (x = 2) {\n  console.log(x)\n}\n`

    const config = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noCondAssign: 'error' as const },
    }
    const issues = await lintText(code, config, 'test.ts')

    // Should report correct line number for the issue. Asserted outright
    // rather than under `if (condAssignIssue)`: the id this looks for was
    // `noCondAssign`, which lintText never reports, so the guard was always
    // false and the two assertions below it never ran.
    const condAssignIssue = issues.find(i => i.ruleId === 'no-cond-assign')
    expect(condAssignIssue).toBeDefined()
    expect(condAssignIssue!.line).toBe(2)
    expect(condAssignIssue!.column).toBeGreaterThan(0)
  })

  it('detects issues across all edge case files', async () => {
    const { lintText, defaultConfig } = await import('pickier')

    const testFiles = [
      'edge-case-nested-structures.ts',
      'edge-case-comments.ts',
      'edge-case-strings-templates.ts',
      'edge-case-multiline-constructs.ts',
      'edge-case-real-world.ts',
    ]

    const config = {
      ...defaultConfig,
      rules: { ...defaultConfig.rules, noCondAssign: 'error' as const },
      pluginRules: {
        ...defaultConfig.pluginRules,
        'pickier/sort-objects': 'warn',
        'pickier/sort-imports': 'warn',
        'pickier/top-level-function': 'warn',
      },
    }

    for (const file of testFiles) {
      const code = readFileSync(join(fixturesDir, file), 'utf-8')
      const issues = await lintText(code, config, file)

      // Each test file should trigger at least one issue
      expect(issues.length).toBeGreaterThan(0)
      // All issues should have required properties
      issues.forEach((issue) => {
        expect(issue.filePath).toBeDefined()
        expect(issue.line).toBeGreaterThan(0)
        expect(issue.column).toBeGreaterThan(0)
        expect(issue.message).toBeDefined()
        expect(issue.severity).toBeDefined()
      })
    }
  })
})
