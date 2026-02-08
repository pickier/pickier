import type { LintIssue, RuleModule } from '../../types'

/**
 * MD001 - Heading levels should only increment by one level at a time
 */
export const headingIncrementRule: RuleModule = {
  meta: {
    docs: 'Heading levels should only increment by one level at a time',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let previousLevel = 0
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

      // Check for ATX style headings (#, ##, etc.)
      const atxMatch = line.match(/^(#{1,6})\s/)
      if (atxMatch) {
        const level = atxMatch[1].length

        if (previousLevel > 0 && level > previousLevel + 1) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/heading-increment',
            message: `Heading level should not skip from h${previousLevel} to h${level}`,
            severity: 'error',
          })
        }

        previousLevel = level
      }
    }

    return issues
  },
}
