import type { LintIssue, RuleModule } from '../../types'

/**
 * MD023 - Headings must start at the beginning of the line
 */
export const headingStartLeftRule: RuleModule = {
  meta: {
    docs: 'Headings must start at the beginning of the line',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
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

      // Check for ATX heading with leading whitespace
      const match = line.match(/^(\s+)(#{1,6}\s)/)

      if (match) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: 1,
          ruleId: 'markdown/heading-start-left',
          message: 'Headings must start at the beginning of the line',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const fixedLines = lines.map((line) => {
      // Remove leading whitespace from headings
      return line.replace(/^(\s+)(#{1,6}\s)/, '$2')
    })
    return fixedLines.join('\n')
  },
}
