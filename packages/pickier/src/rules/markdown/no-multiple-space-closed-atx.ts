import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD021 - Multiple spaces inside hashes on closed atx style heading
 */
export const noMultipleSpaceClosedAtxRule: RuleModule = {
  meta: {
    docs: 'Closed ATX style headings should have only one space inside the hashes',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const codeLines = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      // Skip `#` lines inside code blocks — not headings.
      if (codeLines.has(i))
        continue

      const line = lines[i]

      // Check for closed ATX heading with multiple spaces after opening
      const openMatch = line.match(/^(#{1,6})\s{2,}(?:\S.*?|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])#{1,6}\s*$/)
      if (openMatch) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: openMatch[1].length + 1,
          ruleId: 'markdown/no-multiple-space-closed-atx',
          message: 'Multiple spaces inside hashes on closed atx style heading',
          severity: 'error',
        })
      }

      // Check for multiple spaces before closing hashes
      const closeMatch = line.match(/^#{1,6}\s+(?:\S.*?|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])\s{2,}(#{1,6})\s*$/)
      if (closeMatch) {
        const column = line.lastIndexOf(closeMatch[1]) - 1
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, column),
          ruleId: 'markdown/no-multiple-space-closed-atx',
          message: 'Multiple spaces inside hashes on closed atx style heading',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
