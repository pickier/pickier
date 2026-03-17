import type { RuleModule } from '../../types'

export const noLossOfPrecisionRule: RuleModule = {
  meta: {
    docs: 'Disallow number literals that lose precision',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Find number literals with many digits
      const numberPattern = /\b(\d{17,}(?:\.\d+)?|\d+\.\d{17,})\b/g

      let match
      for (match = numberPattern.exec(line); match !== null; match = numberPattern.exec(line)) {
        const numStr = match[1]
        const num = Number(numStr)

        // Check if the number loses precision when parsed
        if (num.toString() !== numStr) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index + 1,
            ruleId: 'eslint/no-loss-of-precision',
            message: 'This number literal will lose precision at runtime',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
