import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../../src/config'
import { noReversedLinksRule } from '../../../src/rules/markdown/no-reversed-links'

const context = { filePath: 'consumer.md', config: defaultConfig }

describe('reversed links around Markdown code spans', () => {
  it.each([
    '`Object.fromEntries(...)[k]`',
    '`Object.entries(...)[0][0]`',
    '`({ count: number } & {})["count"]`',
    "`typeof import('untyped-esm')['box']`",
    '`` `import("package")["member"]` ``',
  ])('keeps code literal in %s', (source) => {
    expect(noReversedLinksRule.check(source, context)).toEqual([])
  })

  it('recognizes a code span that wraps inside a paragraph', () => {
    const source = 'Use `typeof\nimport("package")["member"]` in this declaration.\n'
    expect(noReversedLinksRule.check(source, context)).toEqual([])
  })

  it('retains both real link warnings and their original columns beside code', () => {
    const source = '🧭 `fn(x)[key]` then (first)[one] and (second)[two]'
    const issues = noReversedLinksRule.check(source, context)
    expect(issues.map(issue => [issue.line, issue.column])).toEqual([
      [1, source.indexOf('(first)') + 1],
      [1, source.indexOf('(second)') + 1],
    ])
  })

  it('does not turn unmatched backticks into a code span', () => {
    const source = 'A stray ` tick followed by (label)[target]'
    const issues = noReversedLinksRule.check(source, context)
    expect(issues.map(issue => issue.column)).toEqual([source.indexOf('(label)') + 1])
  })

  it('treats escaped backticks as literal prose', () => {
    const source = '\\`(label)[target]\\`'
    const issues = noReversedLinksRule.check(source, context)
    expect(issues.map(issue => issue.column)).toEqual([source.indexOf('(label)') + 1])
  })

  it('stops a wrapped span at a paragraph boundary', () => {
    const source = 'A stray ` tick\n\n(label)[target]\n'
    expect(noReversedLinksRule.check(source, context).map(issue => issue.line)).toEqual([3])
  })
})
