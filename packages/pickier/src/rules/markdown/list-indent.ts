import type { LintIssue, RuleModule } from '../../types'

/**
 * MD005 - Inconsistent indentation for list items at the same level
 */
export const listIndentRule: RuleModule = {
  meta: {
    docs: 'List items at the same level should have consistent indentation',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const levelIndents = new Map<number, number>()
    let inList = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for list item (ordered or unordered)
      const match = line.match(/^(\s*)(?:[*\-+]|\d+\.)\s+/)

      if (match) {
        inList = true
        const indent = match[1].length
        const level = Math.floor(indent / 2) // Assume 2-space indentation per level

        if (levelIndents.has(level)) {
          const expectedIndent = levelIndents.get(level)!
          if (indent !== expectedIndent) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/list-indent',
              message: `Inconsistent indentation for list items at the same level. Expected ${expectedIndent} spaces, found ${indent}`,
              severity: 'error',
            })
          }
        }
        else {
          levelIndents.set(level, indent)
        }
      }
      else if (line.trim().length === 0) {
        // Blank line might end the list context
        if (inList) {
          const nextNonBlank = lines.slice(i + 1).find(l => l.trim().length > 0)
          if (nextNonBlank && !/^(?:\s*)(?:[*\-+]|\d+\.)\s+/.test(nextNonBlank)) {
            inList = false
            levelIndents.clear()
          }
        }
      }
    }

    return issues
  },
}
