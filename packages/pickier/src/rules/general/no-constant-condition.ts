import type { RuleModule } from '../../types'

export const noConstantConditionRule: RuleModule = {
  meta: {
    docs: 'Disallow constant expressions in conditions',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match if/while with constant conditions
      const patterns = [
        { pattern: /\b(if|while)\s*\(\s*(true|false)\s*\)/g, type: 'boolean' },
        { pattern: /\b(if|while)\s*\(\s*(\d+)\s*\)/g, type: 'number' },
        { pattern: /\b(if|while)\s*\(\s*(['"`][^'"`]*['"`])\s*\)/g, type: 'string' },
      ]

      for (const { pattern, type } of patterns) {
        let match
        while ((match = pattern.exec(line)) !== null) {
          const keyword = match[1]

          // Skip if in comment
          if (line.substring(0, match.index).includes('//'))
            continue

          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + keyword.length + 2), // +2 for space and (
            ruleId: 'eslint/no-constant-condition',
            message: `Unexpected constant condition`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
