import type { LintIssue, RuleModule } from '../../types'

/**
 * MD036 - Emphasis used instead of a heading
 */
export const noEmphasisAsHeadingRule: RuleModule = {
  meta: {
    docs: 'Emphasis should not be used for headings',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Check for lines that are entirely bold or italic and standalone
      const isBoldLine = /^\*\*[^*]+\*\*\s*$/.test(line) || /^__[^_]+__\s*$/.test(line)
      const isItalicLine = /^\*[^*]+\*\s*$/.test(line) || /^_[^_]+_\s*$/.test(line)
      const isStandalone = prevLine.trim().length === 0 && nextLine.trim().length === 0

      if ((isBoldLine || isItalicLine) && isStandalone) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: 1,
          ruleId: 'markdown/no-emphasis-as-heading',
          message: 'Emphasis used instead of a heading',
          severity: 'warning',
        })
      }
    }

    return issues
  },
}
