import type { RuleModule } from '../../types'

export const noAlertRule: RuleModule = {
  meta: {
    docs: 'Disallow alert, confirm, and prompt',
    recommended: false, // Often disabled in development
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match alert, confirm, prompt calls
      const alertPattern = /\b(alert|confirm|prompt)\s*\(/g
      let match

      for (match = alertPattern.exec(line); match !== null; match = alertPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-alert',
          message: `Unexpected ${match[1]}`,
          severity: 'warning',
        })
      }
    }

    return issues
  },
}
