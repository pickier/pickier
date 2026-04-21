import type { LintIssue, RuleModule } from '../../types'

/**
 * MD028 - Blank line inside blockquote
 */
export const noBlanksBlockquoteRule: RuleModule = {
  meta: {
    docs: 'Blank lines inside blockquotes should use the blockquote symbol',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    let inBlockquote = false
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        inBlockquote = false
        continue
      }
      if (inFence)
        continue

      const isBlockquote = /^\s*>/.test(line)
      const isBlank = line.trim().length === 0
      const nextIsBlockquote = /^\s*>/.test(nextLine)

      if (isBlockquote) {
        inBlockquote = true
      }
      else if (isBlank && inBlockquote && nextIsBlockquote) {
        // Blank line between blockquote lines
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: 1,
          ruleId: 'markdown/no-blanks-blockquote',
          message: 'Blank line inside blockquote should use blockquote symbol (>)',
          severity: 'error',
        })
      }
      else if (!isBlockquote && !isBlank) {
        inBlockquote = false
      }
    }

    return issues
  },
}
