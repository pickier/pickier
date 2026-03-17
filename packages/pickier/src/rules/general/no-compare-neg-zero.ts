import type { RuleModule } from '../../types'

export const noCompareNegZeroRule: RuleModule = {
  meta: {
    docs: 'Disallow comparing against -0',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match comparisons with -0: x === -0, x == -0, etc.
      const pattern = /([!=]==?)\s*-0\b|\b-0\s*([!=]==?)/g

      let match
      for (match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-compare-neg-zero',
          message: 'Do not use the \'-0\' literal in comparisons',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
