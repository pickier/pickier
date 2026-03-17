import type { RuleModule } from '../../types'

export const preferArrowCallbackRule: RuleModule = {
  meta: {
    docs: 'Require using arrow functions for callbacks',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match callbacks that use function() instead of =>
      // Common patterns: .map(function()), .forEach(function()), etc.
      const callbackPattern = /\.(map|filter|reduce|forEach|some|every|find|findIndex)\s*\(\s*function\s*\(/g
      let match

      for (match = callbackPattern.exec(line); match !== null; match = callbackPattern.exec(line)) {
        // Skip if in comment
        if (line.substring(0, match.index).includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/prefer-arrow-callback',
          message: 'Unexpected function expression, use arrow function instead',
          severity: 'warning',
        })
      }
    }

    return issues
  },
}
