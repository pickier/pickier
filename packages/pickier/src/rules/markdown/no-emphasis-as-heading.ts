import type { LintIssue, RuleModule } from '../../types'

/**
 * MD036 - Emphasis used instead of a heading
 *
 * Flags standalone bold/italic lines that look like headings.
 * Matches markdownlint MD036 behavior: skips lines ending in punctuation
 * (., !, ?, :, ,, ;) since those are sentences/labels, not headings.
 */
export const noEmphasisAsHeadingRule: RuleModule = {
  meta: {
    docs: 'Emphasis should not be used for headings',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFence = false

    // Punctuation that indicates sentence/label, not heading
    const punctuationEnd = /[.!?:;,]\s*$/

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Check for lines that are entirely bold or italic and standalone
      const boldMatch = line.match(/^\*\*([^*]+)\*\*\s*$/) || line.match(/^__([^_]+)__\s*$/)
      const italicMatch = line.match(/^\*([^*]+)\*\s*$/) || line.match(/^_([^_]+)_\s*$/)
      const match = boldMatch || italicMatch
      const isStandalone = prevLine.trim().length === 0 && nextLine.trim().length === 0

      if (match && isStandalone) {
        const innerText = match[1]

        // Skip if text ends with punctuation (it's a sentence or label, not a heading)
        if (punctuationEnd.test(innerText))
          continue

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
