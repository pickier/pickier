import type { LintIssue, RuleModule } from '../../types'

/**
 * MD060 - Table column style
 */
export const tableColumnStyleRule: RuleModule = {
  meta: {
    docs: 'Table columns should have consistent alignment',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check if line is a table separator (contains : and -)
      if (/[-:]/.test(line) && /\|/.test(line)) {
        const separatorMatch = line.match(/^[|\s:.-]+$/)

        if (separatorMatch) {
          // This is a table separator line
          const columns = line.split('|').filter(col => col.trim().length > 0)

          for (const column of columns) {
            const trimmed = column.trim()

            // Check for invalid separators (no dashes, or only colons)
            if (!/^:?-+:?$/.test(trimmed)) {
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: line.indexOf(column) + 1,
                ruleId: 'markdown/table-column-style',
                message: 'Invalid table column separator',
                severity: 'error',
              })
            }
          }
        }
      }
    }

    return issues
  },
}
