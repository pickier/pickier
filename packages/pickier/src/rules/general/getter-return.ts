import type { RuleModule } from '../../types'

export const getterReturnRule: RuleModule = {
  meta: {
    docs: 'Enforce return statements in getters',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match getter declaration
      const getterMatch = line.match(/\bget\s+(\w+)\s*\(/)

      if (getterMatch) {
        const getterName = getterMatch[1]
        let foundReturn = false
        let braceCount = 0
        let currentLineIndex = i

        // Search through the getter to find return statement
        while (currentLineIndex < lines.length) {
          const searchLine = lines[currentLineIndex]

          for (const char of searchLine) {
            if (char === '{')
              braceCount++
            if (char === '}') {
              braceCount--
              if (braceCount === 0) {
                // End of getter
                if (!foundReturn) {
                  issues.push({
                    filePath: ctx.filePath,
                    line: i + 1,
                    column: 1,
                    ruleId: 'eslint/getter-return',
                    message: `Getter '${getterName}' must return a value`,
                    severity: 'error',
                  })
                }
                break
              }
            }
          }

          // Check for return statement with a value
          const returnValRe = new RegExp('\\breturn\\s+[^' + ';' + ']')
          if (searchLine.match(returnValRe)) {
            foundReturn = true
          }

          if (braceCount === 0)
            break
          currentLineIndex++
        }
      }
    }

    return issues
  },
}
