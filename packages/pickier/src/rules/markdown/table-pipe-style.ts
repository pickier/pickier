import type { LintIssue, RuleModule } from '../../types'

/**
 * MD055 - Table pipe style
 */
export const tablePipeStyleRule: RuleModule = {
  meta: {
    docs: 'Table pipe style should be consistent',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { style?: 'leading_only' | 'trailing_only' | 'leading_and_trailing' | 'no_leading_or_trailing' }) || {}
    const style = options.style || 'leading_and_trailing'
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Check if line is a table row
      if (/\|/.test(line) && line.trim().length > 0) {
        const hasLeading = line.trim().startsWith('|')
        const hasTrailing = line.trim().endsWith('|')

        if (style === 'leading_and_trailing') {
          if (!hasLeading || !hasTrailing) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/table-pipe-style',
              message: 'Table rows should have leading and trailing pipes',
              severity: 'error',
            })
          }
        }
        else if (style === 'leading_only') {
          if (!hasLeading || hasTrailing) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/table-pipe-style',
              message: 'Table rows should have leading pipe only',
              severity: 'error',
            })
          }
        }
        else if (style === 'trailing_only') {
          if (hasLeading || !hasTrailing) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/table-pipe-style',
              message: 'Table rows should have trailing pipe only',
              severity: 'error',
            })
          }
        }
        else if (style === 'no_leading_or_trailing') {
          if (hasLeading || hasTrailing) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/table-pipe-style',
              message: 'Table rows should not have leading or trailing pipes',
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
}
