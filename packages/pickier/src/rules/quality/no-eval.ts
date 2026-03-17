import type { RuleModule } from '../../types'

export const noEvalRule: RuleModule = {
  meta: {
    docs: 'Disallow use of eval()',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match eval() calls
      const evalPattern = /\beval\s*\(/g
      let match

      for (match = evalPattern.exec(line); match !== null; match = evalPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-eval',
          message: 'eval can be harmful',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
