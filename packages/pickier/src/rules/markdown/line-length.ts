import type { LintIssue, RuleModule } from '../../types'

/**
 * MD013 - Line length
 */
export const lineLengthRule: RuleModule = {
  meta: {
    docs: 'Lines should not exceed a specified length',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { line_length?: number, code_blocks?: boolean, tables?: boolean, headings?: boolean }) || {}
    const maxLength = options.line_length || 80
    const checkCodeBlocks = options.code_blocks !== false
    const checkTables = options.tables !== false
    const checkHeadings = options.headings !== false

    let inCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track code blocks
      if (/^(?:`{3,}|~{3,})/.test(line)) {
        inCodeBlock = !inCodeBlock
        continue
      }

      // Skip code blocks if configured
      if (inCodeBlock && !checkCodeBlocks) {
        continue
      }

      // Skip tables if configured
      if (!checkTables && /\|/.test(line)) {
        continue
      }

      // Skip headings if configured
      if (!checkHeadings && /^#{1,6}\s/.test(line)) {
        continue
      }

      if (line.length > maxLength) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: maxLength + 1,
          ruleId: 'markdown/line-length',
          message: `Line length exceeds ${maxLength} characters (${line.length} characters)`,
          severity: 'warning',
        })
      }
    }

    return issues
  },
}
