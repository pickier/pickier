import type { LintIssue, RuleModule } from '../../types'

/**
 * MD056 - Table column count
 */
export const tableColumnCountRule: RuleModule = {
  meta: {
    docs: 'Table rows should have consistent column counts',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    let inTable = false
    let expectedColumns = -1
    let tableStartLine = -1
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        if (inTable) {
          inTable = false
          expectedColumns = -1
        }
        continue
      }
      if (inFence) continue

      // Check if line is part of a table
      const isTableLine = /\|/.test(line) && line.trim().length > 0

      if (isTableLine) {
        // Count columns (split by | and filter empty)
        const columns = line.split('|').filter(col => col.trim().length > 0 || line.trim().startsWith('|') || line.trim().endsWith('|'))
        const columnCount = columns.length

        if (!inTable) {
          // Start of new table
          inTable = true
          expectedColumns = columnCount
          tableStartLine = i
        }
        else if (columnCount !== expectedColumns) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/table-column-count',
            message: `Table row has ${columnCount} column(s), expected ${expectedColumns}`,
            severity: 'error',
          })
        }
      }
      else if (line.trim().length === 0 || !isTableLine) {
        // End of table
        if (inTable) {
          inTable = false
          expectedColumns = -1
        }
      }
    }

    return issues
  },
}
