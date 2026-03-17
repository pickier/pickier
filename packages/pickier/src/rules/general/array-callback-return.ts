import type { RuleModule } from '../../types'

export const arrayCallbackReturnRule: RuleModule = {
  meta: {
    docs: 'Enforce return statements in callbacks of array methods',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    // Array methods that require a return value
    const arrayMethods = [
      'map',
      'filter',
      'find',
      'findIndex',
      'findLast',
      'findLastIndex',
      'every',
      'some',
      'reduce',
      'reduceRight',
      'sort',
      'flatMap',
    ]

    const methodPattern = new RegExp(`\\.(${arrayMethods.join('|')})\\s*\\(`, 'g')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let match

      for (match = methodPattern.exec(line); match !== null; match = methodPattern.exec(line)) {
        const methodName = match[1]
        const startIndex = match.index + match[0].length

        // Try to find the callback function - look for arrow function or function keyword
        const restOfLine = line.slice(startIndex)
        const arrowMatch = restOfLine.match(/^\s*(?:\(([^)]*)\)|([a-z_$][\w$]*))\s*=>/i)
        const funcMatch = restOfLine.match(/^\s*function\s*(?:[a-zA-Z_$][\w$]*\s*)?\(/)

        if (arrowMatch) {
          // Arrow function - check if it has a block body
          const afterArrow = restOfLine.slice(arrowMatch[0].length).trim()

          // If it starts with '{', it's a block body and needs explicit return
          if (afterArrow.startsWith('{')) {
            // We need to check for return statement in the block
            // For simplicity, we'll check if there's a return statement anywhere after this point
            let foundReturn = false
            let braceCount = 0
            let searchText = afterArrow
            let currentLineIndex = i

            // Search through the block
            while (currentLineIndex < lines.length) {
              const searchLine = currentLineIndex === i ? searchText : lines[currentLineIndex]

              for (let j = 0; j < searchLine.length; j++) {
                const char = searchLine[j]
                if (char === '{')
                  braceCount++
                if (char === '}') {
                  braceCount--
                  if (braceCount === 0) {
                    // End of block - check if we found a return
                    if (!foundReturn) {
                      issues.push({
                        filePath: ctx.filePath,
                        line: i + 1,
                        column: match.index + 1,
                        ruleId: 'eslint/array-callback-return',
                        message: `Array method '${methodName}' callback should return a value`,
                        severity: 'error',
                      })
                    }
                    break
                  }
                }
              }

              // Check for return statement
              if (searchLine.match(/\breturn\s+[^;]/)) {
                foundReturn = true
              }

              if (braceCount === 0)
                break
              currentLineIndex++
              searchText = lines[currentLineIndex] || ''
            }
          }
          // If it's an expression body (no braces), it implicitly returns
        }
        else if (funcMatch) {
          // Regular function - always needs explicit return
          let foundReturn = false
          let braceCount = 0
          let currentLineIndex = i
          let foundOpeningBrace = false

          // Search through the function to find opening brace and check for return
          while (currentLineIndex < lines.length) {
            const searchLine = lines[currentLineIndex]

            for (let j = 0; j < searchLine.length; j++) {
              const char = searchLine[j]

              if (char === '{') {
                braceCount++
                foundOpeningBrace = true
              }
              else if (char === '}') {
                braceCount--
                if (braceCount === 0 && foundOpeningBrace) {
                  // End of function - check if we found a return
                  if (!foundReturn) {
                    issues.push({
                      filePath: ctx.filePath,
                      line: i + 1,
                      column: match.index + 1,
                      ruleId: 'eslint/array-callback-return',
                      message: `Array method '${methodName}' callback should return a value`,
                      severity: 'error',
                    })
                  }
                  break
                }
              }
            }

            // Check for return statement
            if (foundOpeningBrace && searchLine.match(/\breturn\s+[^;]/)) {
              foundReturn = true
            }

            if (braceCount === 0 && foundOpeningBrace)
              break
            currentLineIndex++
          }
        }
      }
    }

    return issues
  },
}
