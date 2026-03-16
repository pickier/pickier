import type { RuleModule } from '../../types'

export const noLonelyIfRule: RuleModule = {
  meta: {
    docs: 'Disallow if statements as the only statement in else blocks',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const _trimmed = line.trim()

      // Check for else followed by { on same or next line
      if (/^\s*else\s*(?:\{\s*)?$/.test(line)) {
        // Look for the opening brace and what's inside
        let braceIdx = i
        let foundBrace = line.includes('{')

        if (!foundBrace) {
          // Check next line for opening brace
          if (i + 1 < lines.length && lines[i + 1].trim() === '{') {
            braceIdx = i + 1
            foundBrace = true
          }
        }

        if (foundBrace) {
          // Find the first non-empty statement in the else block
          for (let j = braceIdx + 1; j < lines.length; j++) {
            const stmtLine = lines[j].trim()

            if (stmtLine === '' || stmtLine.startsWith('//') || stmtLine.startsWith('/*'))
              continue

            // Check if it's a closing brace (empty else)
            if (stmtLine === '}')
              break

            // Check if it's an if statement as the only statement
            if (stmtLine.startsWith('if ') || stmtLine.startsWith('if(')) {
              // This might be a lonely if - verify it's the only statement
              // by checking if the next non-empty line closes the else block
              let isLonely = true
              let depth = 0
              let foundIf = false

              for (let k = j; k < lines.length; k++) {
                const checkLine = lines[k]
                depth += (checkLine.match(/\{/g) || []).length
                depth -= (checkLine.match(/\}/g) || []).length

                if (k === j) {
                  foundIf = true
                  continue
                }

                if (depth === 0) {
                  // We've closed the if statement
                  // Check if the next non-empty line is closing the else
                  for (let m = k + 1; m < lines.length; m++) {
                    const nextLine = lines[m].trim()
                    if (nextLine === '' || nextLine.startsWith('//'))
                      continue
                    if (nextLine === '}' || nextLine.startsWith('}')) {
                      // Yes, lonely if!
                      break
                    }
                    else {
                      isLonely = false
                    }
                    break
                  }
                  break
                }
              }

              if (foundIf && isLonely) {
                issues.push({
                  filePath: ctx.filePath,
                  line: j + 1,
                  column: Math.max(1, lines[j].indexOf('if') + 1),
                  ruleId: 'eslint/no-lonely-if',
                  message: 'Unexpected if as the only statement in an else block',
                  severity: 'warning',
                })
              }
            }
            break // Only check first statement
          }
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const issues = noLonelyIfRule.check!(text, ctx)
    if (issues.length === 0)
      return text

    // This is complex to auto-fix properly, so we'll skip it for now
    // A proper implementation would need to:
    // 1. Remove the else { and }
    // 2. Change if to else if
    // 3. Adjust indentation
    return text
  },
}
