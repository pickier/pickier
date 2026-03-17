import type { RuleModule } from '../../types'

export const noEmptyFunctionRule: RuleModule = {
  meta: {
    docs: 'Disallow empty functions',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match function declarations followed by empty body
      const patterns = [
        /function\s+\w+\s*\([^)]*\)\s*\{\s*\}/g,
        /function\s*\([^)]*\)\s*\{\s*\}/g,
        /\([^)]*\)\s*=>\s*\{\s*\}/g,
        /\w+\s*\([^)]*\)\s*\{\s*\}/g,
      ]

      for (const pattern of patterns) {
        let match
        for (match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
          // Skip if in comment
          if (line.substring(0, match.index).includes('//'))
            continue

          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-empty-function',
            message: 'Unexpected empty function',
            severity: 'warning',
          })
        }
      }
    }

    return issues
  },
}
