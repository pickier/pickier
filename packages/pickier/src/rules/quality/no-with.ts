import type { RuleModule } from '../../types'

export const noWithRule: RuleModule = {
  meta: {
    docs: 'Disallow with statements',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match with statements
      const withPattern = /\bwith\s*\(/g
      let match

      for (match = withPattern.exec(line); match !== null; match = withPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-with',
          message: 'Unexpected use of \'with\' statement',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
