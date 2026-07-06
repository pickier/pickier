import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD019 - Multiple spaces after hash on atx style heading
 */
export const noMultipleSpaceAtxRule: RuleModule = {
  meta: {
    docs: 'ATX style headings should have only one space after the hash',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const codeLines = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      // A `#` line inside a fenced/indented code block (e.g. a shell comment)
      // is not an ATX heading — never flag or rewrite it.
      if (codeLines.has(i))
        continue

      const line = lines[i]

      // Check for ATX heading with multiple spaces after hash
      const match = line.match(/^(#{1,6})\s{2,}/)

      if (match) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match[1].length + 1,
          ruleId: 'markdown/no-multiple-space-atx',
          message: 'Multiple spaces after hash on atx style heading',
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
      // Replace multiple spaces after hash with single space
      return line.replace(/^(#{1,6})\s{2,}/, '$1 ')
    })
    return fixedLines.join('\n')
  },
}
