import type { RuleModule } from '../../types'

export const noSelfCompareRule: RuleModule = {
  meta: {
    docs: 'Disallow comparisons where both sides are identical',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match comparisons with various operators
      const comparePattern = /(\w+(?:\.\w+|\[[^\]]+\])*)\s*(===|!==|==|!=|<|>|<=|>=)\s*(\w+(?:\.\w+|\[[^\]]+\])*)/g
      let match

      while ((match = comparePattern.exec(line)) !== null) {
        const left = match[1].replace(/\s/g, '')
        const _operator = match[2]
        const right = match[3].replace(/\s/g, '')

        if (left === right) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-self-compare',
            message: `Comparing '${match[1]}' to itself is potentially pointless`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
