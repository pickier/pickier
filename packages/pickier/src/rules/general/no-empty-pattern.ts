import type { RuleModule } from '../../types'

export const noEmptyPatternRule: RuleModule = {
  meta: {
    docs: 'Disallow empty destructuring patterns',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match empty destructuring patterns: {} or []
      const emptyObjectPattern = /\{\s*\}\s*=/g
      const emptyArrayPattern = /\[\s*\]\s*=/g

      let match
      for (match = emptyObjectPattern.exec(line); match !== null; match = emptyObjectPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-empty-pattern',
          message: 'Unexpected empty object pattern',
          severity: 'error',
        })
      }

      for (match = emptyArrayPattern.exec(line); match !== null; match = emptyArrayPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-empty-pattern',
          message: 'Unexpected empty array pattern',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
