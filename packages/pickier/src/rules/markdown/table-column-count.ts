import type { LintIssue, RuleModule } from '../../types'
import { findTableRows } from './_shared'

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
    let inFence = false

    const tableRows = findTableRows(lines)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        if (inTable) {
          inTable = false
          expectedColumns = -1
        }
        continue
      }
      if (inFence)
        continue

      const isTableLine = tableRows.has(i) && /\|/.test(line) && line.trim().length > 0

      if (isTableLine) {
        const columnCount = countTableColumns(line)

        if (!inTable) {
          inTable = true
          expectedColumns = columnCount
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
        if (inTable) {
          inTable = false
          expectedColumns = -1
        }
      }
    }

    return issues
  },
}

/**
 * Count the logical columns in a GFM table row, ignoring pipes that are:
 *   - escaped with a backslash (`\|`)
 *   - inside an inline code span (`` ` ``-delimited or `` `` ``-delimited)
 */
function countTableColumns(line: string): number {
  let s = line.trim()
  if (s.startsWith('|'))
    s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|'))
    s = s.slice(0, -1)
  if (s === '')
    return 0

  let count = 1
  let inCode = false
  let codeLen = 0
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      i += 2
      continue
    }
    if (ch === '`') {
      let run = 0
      while (s[i + run] === '`')
        run++
      if (!inCode) {
        inCode = true
        codeLen = run
      }
      else if (run === codeLen) {
        inCode = false
        codeLen = 0
      }
      i += run
      continue
    }
    if (!inCode && ch === '|')
      count++
    i++
  }
  return count
}
