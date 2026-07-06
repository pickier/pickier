import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD027 - Multiple spaces after blockquote symbol
 */
export const noMultipleSpaceBlockquoteRule: RuleModule = {
  meta: {
    docs: 'Blockquote symbols should be followed by a single space',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const codeLines = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      // A `>` line inside a code block is content, not a blockquote.
      if (codeLines.has(i))
        continue

      const line = lines[i]

      // Check for blockquote with multiple spaces after >
      const match = line.match(/^(\s*)(>+)\s{2,}/)

      if (match) {
        const column = match[1].length + match[2].length + 1
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column,
          ruleId: 'markdown/no-multiple-space-blockquote',
          message: 'Multiple spaces after blockquote symbol',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const codeLines = getCodeBlockLines(lines)
    const fixedLines = lines.map((line, i) => {
      if (codeLines.has(i))
        return line
      // Replace multiple spaces after blockquote symbol with single space
      return line.replace(/^(\s*>+)\s{2,}/, '$1 ')
    })
    return fixedLines.join('\n')
  },
}
