import { describe, expect, it } from 'bun:test'
import { lintText } from '../../../src/linter'
import { defaultConfig } from '../../../src/config'
import type { PickierConfig, RuleContext } from '../../../src/types'
import { commaStyleRule } from '../../../src/rules/style/comma-style'
import { dotLocationRule } from '../../../src/rules/style/dot-location'
import { operatorLinebreakRule } from '../../../src/rules/style/operator-linebreak'
import { multilineTernaryRule } from '../../../src/rules/style/multiline-ternary'
import { switchColonSpacingRule } from '../../../src/rules/style/switch-colon-spacing'

function configWith(ruleId: string, severity: 'warn' | 'error' = 'warn'): PickierConfig {
  return {
    ...defaultConfig,
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { ...defaultConfig.pluginRules, [ruleId]: severity },
  }
}

const ctx: RuleContext = { filePath: 'test.ts', config: defaultConfig }

describe('style/comma-style', () => {
  it('should flag comma-first style', async () => {
    const code = 'const a = 1\n  , b = 2\n'
    const cfg = configWith('style/comma-style')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-style')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues[0].message).toContain('end of the previous line')
  })

  it('should not flag comma-last style', async () => {
    const code = 'const a = 1,\n  b = 2\n'
    const cfg = configWith('style/comma-style')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-style')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix comma-first to comma-last', () => {
    const input = 'const a = 1\n  , b = 2\n'
    const result = commaStyleRule.fix!(input, ctx)
    expect(result).toContain('1,')
    expect(result).not.toMatch(/^\s*,/m)
  })
})

describe('style/dot-location', () => {
  it('should flag dot at end of line in chained calls', async () => {
    const code = 'const result = foo.\n  bar()\n'
    const cfg = configWith('style/dot-location')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/dot-location')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues[0].message).toContain('same line as the property')
  })

  it('should not flag dot at start of line', async () => {
    const code = 'const result = foo\n  .bar()\n'
    const cfg = configWith('style/dot-location')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/dot-location')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag dot on same line', async () => {
    const code = 'const result = foo.bar()\n'
    const cfg = configWith('style/dot-location')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/dot-location')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix by moving dot to next line', () => {
    const input = 'const result = foo.\n  bar()\n'
    const result = dotLocationRule.fix!(input, ctx)
    expect(result).toContain('foo\n')
    expect(result).toContain('.bar()')
  })

  it('should not touch a trailing dot inside a multi-line template literal', () => {
    const input = 'const s = `end.\nnext line`\n'
    expect(dotLocationRule.check(input, ctx)).toHaveLength(0)
    expect(dotLocationRule.fix!(input, ctx)).toBe(input)
  })
})

describe('style/operator-linebreak', () => {
  it('should flag operator at end of line', async () => {
    const code = 'const result = a &&\n  b\n'
    const cfg = configWith('style/operator-linebreak')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/operator-linebreak')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should not flag operator at start of next line', async () => {
    const code = 'const result = a\n  && b\n'
    const cfg = configWith('style/operator-linebreak')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/operator-linebreak')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag operators on same line', async () => {
    const code = 'const result = a && b\n'
    const cfg = configWith('style/operator-linebreak')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/operator-linebreak')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not break comments ending with */', async () => {
    const code = '/* comment */\nconst x = 1\n'
    const cfg = configWith('style/operator-linebreak')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/operator-linebreak')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix by moving operator to next line', () => {
    const input = 'const result = a &&\n  b\n'
    const result = operatorLinebreakRule.fix!(input, ctx)
    expect(result).not.toContain('&&\n')
    expect(result).toContain('&& b')
  })
})

describe('style/multiline-ternary', () => {
  it('should not flag single-line ternary', async () => {
    const code = 'const x = a ? b : c\n'
    const cfg = configWith('style/multiline-ternary')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/multiline-ternary')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag consistent multiline ternary', async () => {
    const code = 'const x = a\n  ? b\n  : c\n'
    const cfg = configWith('style/multiline-ternary')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/multiline-ternary')
    expect(ruleIssues).toHaveLength(0)
  })
})

describe('style/switch-colon-spacing', () => {
  it('should flag space before colon in case', async () => {
    const code = 'switch (x) {\n  case 1 :\n    break\n}\n'
    const cfg = configWith('style/switch-colon-spacing')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/switch-colon-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues[0].message).toContain('Unexpected space before colon')
  })

  it('should not flag correct spacing', async () => {
    const code = 'switch (x) {\n  case 1:\n    break\n}\n'
    const cfg = configWith('style/switch-colon-spacing')
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/switch-colon-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix space before colon', () => {
    const input = '  case 1 :\n'
    const result = switchColonSpacingRule.fix!(input, ctx)
    expect(result).toContain('case 1:')
    expect(result).not.toContain('1 :')
  })
})
