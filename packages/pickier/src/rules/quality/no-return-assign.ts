import type { RuleModule } from '../../types'

export const noReturnAssignRule: RuleModule = {
  meta: {
    docs: 'Disallow assignment operators in return statements',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match return with assignment
      const pattern = /\breturn\s[^;]*\b\w+\s*=\s*(?!=)/g
      let match

      for (match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
        // Make sure it's not == or ===
        const returnPart = match[0]
        if (/===|==/.test(returnPart))
          continue

        // Skip if in comment
        if (line.substring(0, match.index).includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-return-assign',
          message: 'Return statement should not contain assignment',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
