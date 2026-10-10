import { describe, expect, it } from 'bun:test'
import { maxStatementsPerLineRule } from '../../src/rules/style/max-statements-per-line'
import { noSuperLinearBacktrackingRule } from '../../src/rules/regexp/no-super-linear-backtracking'

const context = { filePath: 'input.ts' } as never

describe('statement lexical boundaries', () => {
  it('ignores CSS and SQL inside multiline templates', () => {
    const source = 'const style = `\n.ink { stroke: black; fill: none; }\nSELECT one; SELECT two;\n`'
    expect(maxStatementsPerLineRule.check(source, context)).toEqual([])
  })

  it('allows leading ASI guards', () => {
    expect(maxStatementsPerLineRule.check(';(rows[day] ||= []).push(row)', context)).toEqual([])
    expect(maxStatementsPerLineRule.check(';[user] = await createUser()', context)).toEqual([])
  })

  it('still detects multiple statements in template expressions', () => {
    const source = 'const value = `text ${(() => { first(); second() })()}`'
    expect(maxStatementsPerLineRule.check(source, context)).toHaveLength(1)
  })
})

describe('regex lexical boundaries', () => {
  it('ignores division across an aggregate report', () => {
    const source = 'const report = { rate: Math.round(count / (active + count) * 1000) / 10 }'
    expect(noSuperLinearBacktrackingRule.check(source, context)).toEqual([])
  })

  it('ignores pattern text in strings, templates and comments', () => {
    const source = 'const s = "/(.+)+/"\nconst t = `/(.+)+/`\n// /(.+)+/\n/* /(.+)+/ */'
    expect(noSuperLinearBacktrackingRule.check(source, context)).toEqual([])
  })

  it('detects patterns in template expressions and after return', () => {
    expect(noSuperLinearBacktrackingRule.check('const s = `${/(.+)+/.test(input)}`', context)).toHaveLength(1)
    expect(noSuperLinearBacktrackingRule.check('function valid(s) { return /([a-z]+)+/.test(s) }', context)).toHaveLength(1)
  })

  it('keeps slashes inside character classes in the same pattern', () => {
    expect(noSuperLinearBacktrackingRule.check('const re = /([/a-z]+)+/', context)).toHaveLength(1)
  })
})
