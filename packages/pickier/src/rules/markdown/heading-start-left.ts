import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD023 - Headings must start at the beginning of the line
 */
export const headingStartLeftRule: RuleModule = {
  meta: {
    docs: 'Headings must start at the beginning of the line',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    // A `#` line inside a code block is code - a shell or YAML comment
    const codeLines = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (codeLines.has(i))
        continue

      // Check for ATX heading with leading whitespace
      const match = line.match(/^(\s+)(#{1,6}\s)/)

      if (match) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: 1,
          ruleId: 'markdown/heading-start-left',
          message: 'Headings must start at the beginning of the line',
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
      // Remove leading whitespace from headings, never from code
      return codeLines.has(i) ? line : line.replace(/^(\s+)(#{1,6}\s)/, '$2')
    })
    return fixedLines.join('\n')
  },
}
