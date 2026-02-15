import type { LintIssue, RuleModule } from '../../types'

/**
 * MD033 - Inline HTML
 */
export const noInlineHtmlRule: RuleModule = {
  meta: {
    docs: 'Inline HTML should not be used',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { allowed_elements?: string[] }) || {}
    const allowedElements = options.allowed_elements || []
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

      // Strip inline code spans (handle multi-backtick spans like `` `code` ``)
      let stripped = line
      // Strip double-backtick spans first (`` ... ``), then single backtick spans (` ... `)
      stripped = stripped.replace(/``[^`]+``/g, m => ' '.repeat(m.length))
      stripped = stripped.replace(/`[^`]+`/g, m => ' '.repeat(m.length))

      // Simple HTML tag detection
      const matches = stripped.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)

      for (const match of matches) {
        const tagName = match[1].toLowerCase()

        // Skip URL autolinks like <https://...>, <http://...>, <mailto:...>
        const afterTag = stripped.slice(match.index! + 1 + tagName.length)
        if (afterTag.startsWith('://') || (tagName === 'mailto' && afterTag.startsWith(':'))) continue

        if (!allowedElements.includes(tagName)) {
          const column = match.index! + 1
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column,
            ruleId: 'markdown/no-inline-html',
            message: `Inline HTML element '<${tagName}>' should not be used`,
            severity: 'warning',
          })
        }
      }
    }

    return issues
  },
}
