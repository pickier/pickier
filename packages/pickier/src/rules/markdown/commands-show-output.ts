import type { LintIssue, RuleModule } from '../../types'

/**
 * MD014 - Dollar signs used before commands without showing output
 */
export const commandsShowOutputRule: RuleModule = {
  meta: {
    docs: 'Commands in code blocks should not be prefixed with $ unless showing output',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    let inCodeBlock = false
    let codeBlockStartLine = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track code blocks
      if (/^(?:`{3,}|~{3,})/.test(line)) {
        if (!inCodeBlock) {
          inCodeBlock = true
          codeBlockStartLine = i
        }
        else {
          inCodeBlock = false
        }
        continue
      }

      if (inCodeBlock && /^\$\s+/.test(line.trim())) {
        // Check if any line in this code block doesn't start with $
        // If all lines start with $, it's likely showing commands without output
        let allLinesHaveDollar = true
        let hasContent = false

        for (let j = codeBlockStartLine + 1; j < i; j++) {
          const blockLine = lines[j].trim()
          if (blockLine.length > 0) {
            hasContent = true
            if (!blockLine.startsWith('$')) {
              allLinesHaveDollar = false
              break
            }
          }
        }

        if (allLinesHaveDollar && hasContent) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: line.indexOf('$') + 1,
            ruleId: 'markdown/commands-show-output',
            message: 'Dollar signs used before commands without showing output',
            severity: 'warning',
          })
        }
      }
    }

    return issues
  },
}
