import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD018 - No space after hash on atx style heading
 */
export const noMissingSpaceAtxRule: RuleModule = {
  meta: {
    docs: 'ATX style headings must have a space after the hash',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const codeLines = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      // Skip `#` lines inside code blocks (e.g. shell comments) — not headings.
      if (codeLines.has(i))
        continue

      const line = lines[i]

      // Check for ATX heading without space after hash
      const match = line.match(/^(#{1,6})([^\s#])/)

      if (match) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match[1].length + 1,
          ruleId: 'markdown/no-missing-space-atx',
          message: 'No space after hash on atx style heading',
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
      // Add space after hash if missing
      return line.replace(/^(#{1,6})([^\s#])/, '$1 $2')
    })
    return fixedLines.join('\n')
  },
}
