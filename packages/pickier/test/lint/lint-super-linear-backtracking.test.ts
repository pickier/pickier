import { describe, expect, it } from 'bun:test'
import { noSuperLinearBacktrackingRule as rule } from '../../src/rules/regexp/no-super-linear-backtracking'

/**
 * The rule reads a regex literal as syntax, so it has to know which `*`, `+`
 * and `(` are metacharacters and which the author escaped into literal text.
 * Both distinctions used to be approximated, and each approximation reported a
 * pattern that backtracks linearly.
 */
function flags(source: string): boolean {
  return rule.check(source, { filePath: 'input.ts' } as never).length > 0
}

describe('no-super-linear-backtracking: escaped metacharacters', () => {
  it('does not flag a group opening on an escaped asterisk', () => {
    // The asterisk is a literal — this matches a JSDoc line, not a quantifier.
    expect(flags('const a = /(\\* hello)[^`]*/')).toBe(false)
  })

  it('does not flag an escaped plus inside a group', () => {
    expect(flags('const a = /(\\+foo)bar/')).toBe(false)
  })

  it('does not flag a JSDoc rewrite pattern', () => {
    // Reduced from ts-pantry's version-fetcher, which this rule rejected: an
    // escaped `*`, a character class, and escaped parens in one literal.
    expect(flags('const a = /(\\* @version `)[^`]*(` \\()\\d+( versions available\\))/')).toBe(false)
  })
})

describe('no-super-linear-backtracking: real nesting still caught', () => {
  it('flags the canonical (.+)+', () => {
    expect(flags('const a = /(.+)+/')).toBe(true)
  })

  it('flags a quantified character class inside a quantified group', () => {
    // The quantifier has to stay attached to the class when the class collapses
    // to one atom, or this — the textbook catastrophic case — stops matching.
    expect(flags('const a = /([a-z]+)+/')).toBe(true)
  })

  it('flags a non-capturing nested quantifier', () => {
    expect(flags('const a = /(?:a+)+/')).toBe(true)
  })
})

describe('no-super-linear-backtracking: linear patterns stay quiet', () => {
  it('does not flag a quantified alternation', () => {
    expect(flags('const a = /(?:a|b)*x/')).toBe(false)
  })

  it('does not flag a quantified class outside any group', () => {
    expect(flags('const a = /[a-z]+x/')).toBe(false)
  })
})
