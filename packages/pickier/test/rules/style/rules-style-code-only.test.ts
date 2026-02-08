import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLintProgrammatic } from '../../../src/index'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-style-code-only-'))
}

describe('style rules wrapped in codeOnly', () => {
  it('max-statements-per-line should not flag CSS declarations with comments', async () => {
    const dir = tmp()
    const file = join(dir, 'theme.css')
    // CSS declaration followed by a comment - should NOT be treated as 2 statements
    writeFileSync(file, `:root {
  --vp-c-text-dark-1: #ffffff;  /* Adding this to ensure light text */
  --vp-c-text-code: #4a72bf;
}
`, 'utf8')

    const configFile = join(dir, 'pickier.config.json')
    writeFileSync(configFile, JSON.stringify({
      lint: { extensions: ['css'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'style/max-statements-per-line': 'error' },
    }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
    const maxStmtIssues = res.issues.filter(i => i.ruleId === 'style/max-statements-per-line' || i.ruleId === 'max-statements-per-line')
    expect(maxStmtIssues).toHaveLength(0)
  })

  it('max-statements-per-line should still flag JS/TS files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, 'const _a = 1; const _b = 2\n', 'utf8')

    const configFile = join(dir, 'pickier.config.json')
    writeFileSync(configFile, JSON.stringify({
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'style/max-statements-per-line': 'error' },
    }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
    const maxStmtIssues = res.issues.filter(i => i.ruleId === 'style/max-statements-per-line' || i.ruleId === 'max-statements-per-line')
    expect(maxStmtIssues.length).toBeGreaterThan(0)
  })

  it('brace-style should not run on CSS files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.css')
    writeFileSync(file, `.foo\n{\n  color: red;\n}\n`, 'utf8')

    const configFile = join(dir, 'pickier.config.json')
    writeFileSync(configFile, JSON.stringify({
      lint: { extensions: ['css'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'style/brace-style': 'error' },
    }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
    const braceIssues = res.issues.filter(i => i.ruleId === 'style/brace-style' || i.ruleId === 'brace-style')
    expect(braceIssues).toHaveLength(0)
  })

  it('if-newline should not run on CSS files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.css')
    writeFileSync(file, `.foo { color: red; }\n`, 'utf8')

    const configFile = join(dir, 'pickier.config.json')
    writeFileSync(configFile, JSON.stringify({
      lint: { extensions: ['css'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'style/if-newline': 'error' },
    }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
    const ifNewlineIssues = res.issues.filter(i => i.ruleId === 'style/if-newline' || i.ruleId === 'if-newline')
    expect(ifNewlineIssues).toHaveLength(0)
  })

  it('curly should not run on CSS files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.css')
    writeFileSync(file, `.foo { color: red; }\n`, 'utf8')

    const configFile = join(dir, 'pickier.config.json')
    writeFileSync(configFile, JSON.stringify({
      lint: { extensions: ['css'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'style/curly': 'error' },
    }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
    const curlyIssues = res.issues.filter(i => i.ruleId === 'style/curly' || i.ruleId === 'curly')
    expect(curlyIssues).toHaveLength(0)
  })

  it('style rules should still run on .ts files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    // brace-style: opening brace on next line should be flagged
    writeFileSync(file, `function _test()\n{\n  return 1\n}\n`, 'utf8')

    const configFile = join(dir, 'pickier.config.json')
    writeFileSync(configFile, JSON.stringify({
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'style/brace-style': 'error' },
    }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
    const braceIssues = res.issues.filter(i => i.ruleId === 'style/brace-style' || i.ruleId === 'brace-style')
    expect(braceIssues.length).toBeGreaterThan(0)
  })

  it('style rules should still run on .js files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.js')
    writeFileSync(file, 'const _a = 1; const _b = 2\n', 'utf8')

    const configFile = join(dir, 'pickier.config.json')
    writeFileSync(configFile, JSON.stringify({
      lint: { extensions: ['js'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'style/max-statements-per-line': 'error' },
    }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', config: configFile, maxWarnings: -1 })
    const maxStmtIssues = res.issues.filter(i => i.ruleId === 'style/max-statements-per-line' || i.ruleId === 'max-statements-per-line')
    expect(maxStmtIssues.length).toBeGreaterThan(0)
  })
})
