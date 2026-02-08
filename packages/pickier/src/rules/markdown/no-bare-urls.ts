import type { LintIssue, RuleModule } from '../../types'

/**
 * MD034 - Bare URL used
 */
export const noBareUrlsRule: RuleModule = {
  meta: {
    docs: 'Bare URLs should be wrapped in angle brackets',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFence = false
    let inHtmlComment = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Track HTML comments (multi-line)
      if (line.includes('<!--'))
        inHtmlComment = true
      if (line.includes('-->')) {
        inHtmlComment = false
        continue
      }
      if (inHtmlComment)
        continue

      // Skip reference link definition lines: [label]: url
      if (/^\[([^\]]+)\]:\s*\S+/.test(line))
        continue

      // Strip inline code spans before checking
      const stripped = line.replace(/`[^`]+`/g, m => ' '.repeat(m.length))

      // Simple URL pattern (not inside <>, [](url), or HTML attributes like src="url")
      const urlPattern = /(?<![<(="'])https?:\/\/[^\s<>`)\]"']+(?![>\])"'])/g
      const matches = stripped.matchAll(urlPattern)

      for (const match of matches) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index! + 1,
          ruleId: 'markdown/no-bare-urls',
          message: 'Bare URL used. Wrap in angle brackets: <url>',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    let inFence = false
    let inHtmlComment = false
    const fixedLines = lines.map((line) => {
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        return line
      }
      if (inFence)
        return line

      if (line.includes('<!--'))
        inHtmlComment = true
      if (line.includes('-->')) {
        inHtmlComment = false
        return line
      }
      if (inHtmlComment)
        return line

      // Skip reference link definition lines
      if (/^\[([^\]]+)\]:\s*\S+/.test(line))
        return line

      return line.replace(/(?<![<(="'])https?:\/\/[^\s<>`)\]"']+(?![>\])"'])/g, '<$&>')
    })
    return fixedLines.join('\n')
  },
}
