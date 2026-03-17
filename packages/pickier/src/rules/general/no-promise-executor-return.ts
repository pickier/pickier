import type { RuleModule } from '../../types'

export const noPromiseExecutorReturnRule: RuleModule = {
  meta: {
    docs: 'Disallow returning values from Promise executor functions',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Look for new Promise(...
      const promiseMatch = line.match(/new\s+Promise\s*\(/)

      if (promiseMatch) {
        let braceCount = 0
        let inExecutor = false
        let currentLineIndex = i

        // Search through the executor function
        while (currentLineIndex < lines.length) {
          const searchLine = lines[currentLineIndex]

          for (const char of searchLine) {
            if (char === '{') {
              braceCount++
              inExecutor = true
            }
            if (char === '}') {
              braceCount--
              if (braceCount === 0 && inExecutor) {
                break
              }
            }
          }

          // Check for return statement with a value (not just "return")
          const returnValueRe = new RegExp('\\breturn\\s+[^' + ';' + ']')
          if (inExecutor && searchLine.match(returnValueRe)) {
            issues.push({
              filePath: ctx.filePath,
              line: currentLineIndex + 1,
              column: 1,
              ruleId: 'eslint/no-promise-executor-return',
              message: 'Return values from promise executor functions cannot be read',
              severity: 'error',
            })
          }

          if (braceCount === 0 && inExecutor)
            break
          currentLineIndex++
        }
      }
    }

    return issues
  },
}
