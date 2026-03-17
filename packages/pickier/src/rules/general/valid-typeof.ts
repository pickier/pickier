import type { RuleModule } from '../../types'

const validTypes = ['undefined', 'object', 'boolean', 'number', 'string', 'function', 'symbol', 'bigint']

export const validTypeofRule: RuleModule = {
  meta: {
    docs: 'Enforce comparing typeof expressions against valid strings',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match typeof comparisons
      const typeofPattern = /typeof\s+\w+\s*(?:===|!==|==|!=)\s*(['"`])(\w+)\1/g
      let match

      for (match = typeofPattern.exec(line); match !== null; match = typeofPattern.exec(line)) {
        const typeString = match[2]

        if (!validTypes.includes(typeString)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/valid-typeof',
            message: `Invalid typeof comparison value '${typeString}'`,
            severity: 'error',
          })
        }
      }

      // Also check reverse: 'string' === typeof x
      const reversePattern = /(['"`])(\w+)\1\s*(?:===|!==|==|!=)\s*typeof\s+\w+/g
      for (match = reversePattern.exec(line); match !== null; match = reversePattern.exec(line)) {
        const typeString = match[2]

        if (!validTypes.includes(typeString)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/valid-typeof',
            message: `Invalid typeof comparison value '${typeString}'`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
