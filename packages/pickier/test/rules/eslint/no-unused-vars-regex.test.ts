import { describe, expect, it } from 'bun:test'
import { noUnusedVarsRule } from '../../../src/rules/general/no-unused-vars'

const defaultCtx = {
  filePath: 'test.ts',
  config: {} as any,
  options: {},
}

describe('no-unused-vars: regex literals containing function keyword', () => {
  it('should not flag character classes inside regex as unused params', () => {
    // Regex like /function\s+([a-zA-Z_$][\w$]*)/g contains identifiers
    // (a, zA, Z_$, w$) inside character classes — these are NOT function parameters
    const src = [
      'export function removeLocallyDefined(strippedCode: string, usedNames: Set<string>): void {',
      '  const patterns = [',
      '    /(?:export\\s+)?(?:async\\s+)?function\\s+([a-zA-Z_$][\\w$]*)/g,',
      '    /(?:export\\s+)?(?:const|let|var)\\s+([a-zA-Z_$][\\w$]*)/g,',
      '    /(?:export\\s+)?class\\s+([a-zA-Z_$][\\w$]*)/g,',
      '  ]',
      '',
      '  for (const pattern of patterns) {',
      '    let match',
      '    while ((match = pattern.exec(strippedCode)) !== null) {',
      '      if (match[1]) usedNames.delete(match[1])',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n')

    const issues = noUnusedVarsRule.check(src, defaultCtx)
    // Should NOT report a, zA, Z_$, w$ as unused function parameters
    const falsePositives = issues.filter(i =>
      ['a', 'zA', 'Z_$', 'w$'].includes(i.message.match(/'(\w+\$?)'/)?.[1] ?? ''),
    )
    expect(falsePositives).toHaveLength(0)
  })

  it('should not flag regex at start of line in array as function declaration', () => {
    // When a regex starts with only whitespace before it (common in arrays),
    // stripRegex must still detect it as a regex literal
    const src = [
      'const _patterns = [',
      '  /function\\s+(\\w+)/g,',
      '  /class\\s+(\\w+)/g,',
      ']',
      '',
    ].join('\n')

    const issues = noUnusedVarsRule.check(src, defaultCtx)
    const funcParamIssues = issues.filter(i => i.message.includes('function parameter'))
    expect(funcParamIssues).toHaveLength(0)
  })

  it('should not flag regex assigned after equals as function declaration', () => {
    const src = [
      'const _re = /function\\s+([a-zA-Z_$][\\w$]*)/g',
      '',
    ].join('\n')

    const issues = noUnusedVarsRule.check(src, defaultCtx)
    const funcParamIssues = issues.filter(i => i.message.includes('function parameter'))
    expect(funcParamIssues).toHaveLength(0)
  })

  it('should still detect real unused function parameters', () => {
    const src = [
      'function process(used: string, unused: number): string {',
      '  return used',
      '}',
      '',
    ].join('\n')

    const issues = noUnusedVarsRule.check(src, defaultCtx)
    const unusedParam = issues.filter(i =>
      i.message.includes('\'unused\'') && i.message.includes('function parameter'),
    )
    expect(unusedParam).toHaveLength(1)
  })

  it('should not flag regex at very start of line (position 0)', () => {
    // Edge case: regex literal is the very first character on the line
    const src = [
      'const _results = []',
      '/function\\s+(\\w+)/g.exec("function foo")',
      '',
    ].join('\n')

    const issues = noUnusedVarsRule.check(src, defaultCtx)
    const funcParamIssues = issues.filter(i => i.message.includes('function parameter'))
    expect(funcParamIssues).toHaveLength(0)
  })
})
