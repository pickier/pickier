import type { LintIssue, RuleModule } from '../../types'
import { findTableRows } from './_shared'

/**
 * MD058 - Tables should be surrounded by blank lines
 */
export const blanksAroundTablesRule: RuleModule = {
  meta: {
    docs: 'Tables should be surrounded by blank lines',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    let inTable = false
    let inFence = false

    const tableRows = findTableRows(lines)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        if (inTable)
          inTable = false
        continue
      }
      if (inFence)
        continue

      // Check if line is part of a genuine GFM table
      const isTableLine = tableRows.has(i) && /\|/.test(line) && line.trim().length > 0

      if (isTableLine && !inTable) {
        // Start of table
        inTable = true

        // Check previous line
        if (i > 0 && prevLine.trim().length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/blanks-around-tables',
            message: 'Tables should be surrounded by blank lines',
            severity: 'error',
          })
        }
      }
      else if (!isTableLine && inTable) {
        // End of table
        inTable = false

        // Check if current line is not blank
        if (line.trim().length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/blanks-around-tables',
            message: 'Tables should be surrounded by blank lines',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  // No `fix` for now. The fence-tracking helpers used by this rule's
  // `check` (and by `findTableRows`) toggle on every 3+ backtick fence
  // regardless of length, which gets confused by nested fences (e.g.
  // a 4-tick block containing 3-tick blocks — common in markdown that
  // documents markdown). An auto-fix that adds blank lines around a
  // "table" can therefore insert a blank inside an outer code fence
  // and corrupt examples. Until fence tracking is length-aware, leave
  // this report-only.
}
