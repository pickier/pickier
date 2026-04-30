import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'
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
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)
    const tableRows = findTableRows(lines)
    const result: string[] = []
    let inTable = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Code block lines (fenced or indented) are content — never inject
      // blank separators inside them.
      if (inCode.has(i)) {
        // Leaving the table state alone here is fine because tableRows
        // already excludes code-block lines.
        result.push(line)
        continue
      }
      const isTableLine = tableRows.has(i) && /\|/.test(line) && line.trim().length > 0
      if (isTableLine && !inTable) {
        // Start of a table — ensure the previous emitted line is blank
        // (only when we're not at the start of the document and the
        // previous line isn't itself inside a code block, since that
        // line is content the user didn't ask us to separate from).
        const prevIdx = result.length - 1
        if (prevIdx >= 0 && result[prevIdx].trim().length > 0) {
          result.push('')
        }
        inTable = true
        result.push(line)
        continue
      }
      if (!isTableLine && inTable) {
        inTable = false
        if (line.trim().length > 0)
          result.push('')
      }
      result.push(line)
    }
    const out = result.join('\n')
    return out !== text ? out : text
  },
}
