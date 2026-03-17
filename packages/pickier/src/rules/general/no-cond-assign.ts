import type { RuleModule } from '../../types'

export const noCondAssignRule: RuleModule = {
  meta: {
    docs: 'Disallow assignment operators in conditional expressions',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match if/while with assignment in condition
      // Looking for: if (x = value) or while (x = value)
      const pattern = /\b(if|while)\s*\([^)]*\b(\w+)\s*=\s*(?!=)[^)]*\)/g
      let match

      for (match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
        // Check it's not == or ===
        const conditionPart = match[0]
        if (/===|==/.test(conditionPart))
          continue

        // Skip if in comment
        if (line.substring(0, match.index).includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-cond-assign',
          message: 'Expected a conditional expression and instead saw an assignment',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
