import { describe, expect, it } from 'bun:test'
import { lintText } from '../../../src/linter'
import { defaultConfig } from '../../../src/config'
import type { PickierConfig, RuleContext } from '../../../src/types'
import { keywordSpacingRule } from '../../../src/rules/style/keyword-spacing'
import { arrowSpacingRule } from '../../../src/rules/style/arrow-spacing'
import { spaceInfixOpsRule } from '../../../src/rules/style/space-infix-ops'
import { commaSpacingRule } from '../../../src/rules/style/comma-spacing'
import { semiSpacingRule } from '../../../src/rules/style/semi-spacing'
import { restSpreadSpacingRule } from '../../../src/rules/style/rest-spread-spacing'

// Helper to create config with a specific rule enabled
function configWith(ruleId: string, severity: 'warn' | 'error' = 'warn'): PickierConfig {
  return {
    ...defaultConfig,
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { ...defaultConfig.pluginRules, [ruleId]: severity },
  }
}

// Simple rule context for direct fix() calls
const ctx: RuleContext = { filePath: 'test.ts', config: defaultConfig }

// ---------------------------------------------------------------------------
// style/keyword-spacing
// ---------------------------------------------------------------------------
describe('style/keyword-spacing', () => {
  it('should flag missing space after keyword before paren', async () => {
    const cfg = configWith('style/keyword-spacing')
    const issues = await lintText('if(x) {}\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/keyword-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('after'))).toBe(true)
  })

  it('should flag missing space before keyword after brace', async () => {
    const cfg = configWith('style/keyword-spacing')
    const issues = await lintText('if (x) { foo() }else { bar() }\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/keyword-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('before'))).toBe(true)
  })

  it('should flag missing space before catch after paren', async () => {
    const cfg = configWith('style/keyword-spacing')
    const issues = await lintText('try { foo() }catch(e) {}\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/keyword-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should not flag properly spaced keywords', async () => {
    const cfg = configWith('style/keyword-spacing')
    const code = 'if (x) { foo() } else { bar() }\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/keyword-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag keywords inside line comments', async () => {
    const cfg = configWith('style/keyword-spacing')
    const code = '// if(x) for(y) while(z)\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/keyword-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag keywords inside strings', async () => {
    const cfg = configWith('style/keyword-spacing')
    const code = 'const s = \'if(x) else{}\'\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/keyword-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix missing space after keyword', () => {
    const result = keywordSpacingRule.fix!('if(x) {}\n', ctx)
    expect(result).toContain('if (x)')
  })

  it('should fix missing space before else after brace', () => {
    const result = keywordSpacingRule.fix!('if (x) { foo() }else { bar() }\n', ctx)
    expect(result).toContain('} else')
  })

  it('should fix missing space before and after catch', () => {
    const result = keywordSpacingRule.fix!('try { foo() }catch(e) {}\n', ctx)
    expect(result).toContain('} catch (e)')
  })
})

// ---------------------------------------------------------------------------
// style/arrow-spacing
// ---------------------------------------------------------------------------
describe('style/arrow-spacing', () => {
  it('should flag missing space before and after =>', async () => {
    const cfg = configWith('style/arrow-spacing')
    const issues = await lintText('const fn = x=>y\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/arrow-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should flag missing space only before =>', async () => {
    const cfg = configWith('style/arrow-spacing')
    const issues = await lintText('const fn = x=> y\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/arrow-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('before'))).toBe(true)
  })

  it('should flag missing space only after =>', async () => {
    const cfg = configWith('style/arrow-spacing')
    const issues = await lintText('const fn = x =>{}\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/arrow-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('after'))).toBe(true)
  })

  it('should not flag properly spaced arrow', async () => {
    const cfg = configWith('style/arrow-spacing')
    const code = 'const fn = x => y\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/arrow-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag arrow at end of line with body on next line', async () => {
    const cfg = configWith('style/arrow-spacing')
    const code = 'const fn = x =>\n  y\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/arrow-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag => inside comments', async () => {
    const cfg = configWith('style/arrow-spacing')
    const code = '// x=>y is an arrow\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/arrow-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag => inside strings', async () => {
    const cfg = configWith('style/arrow-spacing')
    const code = 'const s = \'x=>y\'\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/arrow-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix missing spaces around =>', () => {
    const result = arrowSpacingRule.fix!('const fn = x=>y\n', ctx)
    expect(result).toContain('x => y')
  })

  it('should fix missing space before => only', () => {
    const result = arrowSpacingRule.fix!('const fn = x=> y\n', ctx)
    expect(result).toContain('x => y')
  })

  it('should fix missing space after => only', () => {
    const result = arrowSpacingRule.fix!('const fn = x =>{}\n', ctx)
    expect(result).toContain('=> {}')
  })
})

// ---------------------------------------------------------------------------
// style/space-infix-ops
// ---------------------------------------------------------------------------
describe('style/space-infix-ops', () => {
  it('should flag missing spacing around &&', async () => {
    const cfg = configWith('style/space-infix-ops')
    const issues = await lintText('const x = a&&b\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/space-infix-ops')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should flag missing spacing around ||', async () => {
    const cfg = configWith('style/space-infix-ops')
    const issues = await lintText('const x = a||b\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/space-infix-ops')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should flag missing spacing around ??', async () => {
    const cfg = configWith('style/space-infix-ops')
    const issues = await lintText('const x = a??b\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/space-infix-ops')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should flag missing spacing around +=', async () => {
    const cfg = configWith('style/space-infix-ops')
    const issues = await lintText('let x = 1\nx+=2\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/space-infix-ops')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should not flag properly spaced operators', async () => {
    const cfg = configWith('style/space-infix-ops')
    const code = 'const x = a && b || c ?? d\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/space-infix-ops')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag operators inside comments', async () => {
    const cfg = configWith('style/space-infix-ops')
    const code = '// a&&b || c??d\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/space-infix-ops')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag operators inside strings', async () => {
    const cfg = configWith('style/space-infix-ops')
    const code = 'const s = \'a&&b||c\'\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/space-infix-ops')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix missing spacing around &&', () => {
    const result = spaceInfixOpsRule.fix!('const x = a&&b\n', ctx)
    expect(result).toContain('a && b')
  })

  it('should fix missing spacing around ||', () => {
    const result = spaceInfixOpsRule.fix!('const x = a||b\n', ctx)
    expect(result).toContain('a || b')
  })

  it('should fix missing spacing around ??', () => {
    const result = spaceInfixOpsRule.fix!('const x = a??b\n', ctx)
    expect(result).toContain('a ?? b')
  })
})

// ---------------------------------------------------------------------------
// style/comma-spacing
// ---------------------------------------------------------------------------
describe('style/comma-spacing', () => {
  it('should flag missing space after comma', async () => {
    const cfg = configWith('style/comma-spacing')
    const issues = await lintText('const arr = [a,b,c]\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('after'))).toBe(true)
  })

  it('should flag space before comma', async () => {
    const cfg = configWith('style/comma-spacing')
    const issues = await lintText('const arr = [a , b]\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('before'))).toBe(true)
  })

  it('should flag both space before and missing space after comma', async () => {
    const cfg = configWith('style/comma-spacing')
    const issues = await lintText('const arr = [a ,b]\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-spacing')
    expect(ruleIssues.length).toBeGreaterThanOrEqual(2)
  })

  it('should not flag properly spaced commas', async () => {
    const cfg = configWith('style/comma-spacing')
    const code = 'const arr = [a, b, c]\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag trailing comma at end of line', async () => {
    const cfg = configWith('style/comma-spacing')
    const code = 'const obj = {\n  a: 1,\n  b: 2,\n}\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag commas inside strings', async () => {
    const cfg = configWith('style/comma-spacing')
    const code = 'const s = \'a,b,c\'\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag commas inside comments', async () => {
    const cfg = configWith('style/comma-spacing')
    const code = '// a,b,c\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/comma-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix missing space after comma', () => {
    const result = commaSpacingRule.fix!('const arr = [a,b,c]\n', ctx)
    expect(result).toContain('[a, b, c]')
  })

  it('should fix space before comma', () => {
    const result = commaSpacingRule.fix!('const arr = [a , b]\n', ctx)
    expect(result).toContain('[a, b]')
  })

  it('should fix both space before and missing space after comma', () => {
    const result = commaSpacingRule.fix!('const arr = [a ,b]\n', ctx)
    expect(result).toContain('[a, b]')
  })
})

// ---------------------------------------------------------------------------
// style/semi-spacing
// ---------------------------------------------------------------------------
describe('style/semi-spacing', () => {
  it('should flag space before semicolon', async () => {
    const cfg = configWith('style/semi-spacing')
    const issues = await lintText('const x = 1 ;\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/semi-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('before'))).toBe(true)
  })

  it('should flag missing space after semicolon in for-loop', async () => {
    const cfg = configWith('style/semi-spacing')
    const issues = await lintText('for (let i = 0;i < 10;i++) {}\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/semi-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('after'))).toBe(true)
  })

  it('should flag space before semicolon in for-loop', async () => {
    const cfg = configWith('style/semi-spacing')
    const issues = await lintText('for (let i = 0 ; i < 10 ; i++) {}\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/semi-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
    expect(ruleIssues.some(i => i.message.includes('before'))).toBe(true)
  })

  it('should not flag properly spaced for-loop', async () => {
    const cfg = configWith('style/semi-spacing')
    const code = 'for (let i = 0; i < 10; i++) {}\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/semi-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag semicolon at end of statement', async () => {
    const cfg = configWith('style/semi-spacing')
    const code = 'const x = 1;\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/semi-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag semicolons inside comments', async () => {
    const cfg = configWith('style/semi-spacing')
    const code = '// for (a ;b ;c)\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/semi-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag semicolons inside strings', async () => {
    const cfg = configWith('style/semi-spacing')
    const code = 'const s = \'a ;b ;c\'\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/semi-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix space before semicolon', () => {
    const result = semiSpacingRule.fix!('const x = 1 ;\n', ctx)
    expect(result).toContain('1;')
    expect(result).not.toContain('1 ;')
  })

  it('should fix missing space after semicolon in for-loop', () => {
    const result = semiSpacingRule.fix!('for (let i = 0;i < 10;i++) {}\n', ctx)
    expect(result).toContain('; i < 10')
    expect(result).toContain('; i++)')
  })

  it('should fix space before semicolons in for-loop', () => {
    const result = semiSpacingRule.fix!('for (let i = 0 ; i < 10 ; i++) {}\n', ctx)
    expect(result).toContain('0;')
    expect(result).toContain('10;')
    expect(result).not.toContain(' ;')
  })
})

// ---------------------------------------------------------------------------
// style/rest-spread-spacing
// ---------------------------------------------------------------------------
describe('style/rest-spread-spacing', () => {
  it('should flag space after spread in array', async () => {
    const cfg = configWith('style/rest-spread-spacing')
    const issues = await lintText('const arr = [... items]\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/rest-spread-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should flag space after rest in function params', async () => {
    const cfg = configWith('style/rest-spread-spacing')
    const issues = await lintText('function foo(... args) {}\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/rest-spread-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should flag space after spread in object', async () => {
    const cfg = configWith('style/rest-spread-spacing')
    const issues = await lintText('const obj = { ... other }\n', cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/rest-spread-spacing')
    expect(ruleIssues.length).toBeGreaterThan(0)
  })

  it('should not flag spread without space', async () => {
    const cfg = configWith('style/rest-spread-spacing')
    const code = 'const arr = [...items]\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/rest-spread-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag rest without space in function params', async () => {
    const cfg = configWith('style/rest-spread-spacing')
    const code = 'function foo(...args) {}\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/rest-spread-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag spread inside comments', async () => {
    const cfg = configWith('style/rest-spread-spacing')
    const code = '// ... items\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/rest-spread-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should not flag spread inside strings', async () => {
    const cfg = configWith('style/rest-spread-spacing')
    const code = 'const s = \'... items\'\n'
    const issues = await lintText(code, cfg, 'test.ts')
    const ruleIssues = issues.filter(i => i.ruleId === 'style/rest-spread-spacing')
    expect(ruleIssues).toHaveLength(0)
  })

  it('should fix space after spread', () => {
    const result = restSpreadSpacingRule.fix!('const arr = [... items]\n', ctx)
    expect(result).toContain('[...items]')
  })

  it('should fix space after rest in function params', () => {
    const result = restSpreadSpacingRule.fix!('function foo(... args) {}\n', ctx)
    expect(result).toContain('(...args)')
  })

  it('should fix multiple spaces after spread', () => {
    const result = restSpreadSpacingRule.fix!('const arr = [...   items]\n', ctx)
    expect(result).toContain('[...items]')
  })
})
