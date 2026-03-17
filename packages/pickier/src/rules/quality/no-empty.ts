import type { RuleModule } from '../../types'

export const noEmptyRule: RuleModule = {
  meta: {
    docs: 'Disallow empty block statements',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for empty blocks: {} or { } (with optional whitespace)
      // But not object literals in declarations
      const emptyBlockPattern = /\{\s*\}/g
      let match

      for (match = emptyBlockPattern.exec(line); match !== null; match = emptyBlockPattern.exec(line)) {
        // Try to determine if this is a statement block, not an object literal
        const beforeBlock = line.substring(0, match.index).trim()

        // Heuristics to identify statement blocks:
        // - After control keywords: if, else, for, while, do, try, catch, finally, function
        // - Not after = (object literal assignment)
        // - Not after : (object property)
        // - Not after return (object literal return)
        const isStatementBlock = /(?:if|else|for|while|do|try|catch|finally|function|\})\s*$/.test(beforeBlock)
        const isObjectLiteral = /[=:]$/.test(beforeBlock) || /return\s*$/.test(beforeBlock)

        if (isStatementBlock && !isObjectLiteral) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-empty',
            message: 'Empty block statement',
            severity: 'error',
          })
        }
      }
    }

    // Also check for multi-line empty blocks
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]
      const _nextLine = lines[i + 1]

      // Check for { on one line and } on the next with nothing in between
      if (/\{\s*$/.test(line.trim())) {
        // Check if next non-empty line is just }
        for (let j = i + 1; j < lines.length; j++) {
          const checkLine = lines[j].trim()
          if (checkLine === '')
            continue
          if (checkLine === '}' || checkLine.startsWith('}')) {
            // Check if this looks like a statement block
            const beforeBlock = line.substring(0, line.lastIndexOf('{')).trim()
            const isStatementBlock = /(?:if|else|for|while|do|try|catch|finally|function|\})\s*$/.test(beforeBlock)
            const isObjectLiteral = /[=:]$/.test(beforeBlock) || /return\s*$/.test(beforeBlock)

            if (isStatementBlock && !isObjectLiteral && j === i + 1) { // Only if directly next line
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: Math.max(1, line.lastIndexOf('{') + 1),
                ruleId: 'eslint/no-empty',
                message: 'Empty block statement',
                severity: 'error',
              })
            }
          }
          break
        }
      }
    }

    return issues
  },
}
