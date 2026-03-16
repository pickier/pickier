import type { LintIssue, RuleModule } from '../../types'

/**
 * MD011 - Reversed link syntax
 */
export const noReversedLinksRule: RuleModule = {
  meta: {
    docs: 'Link syntax should not be reversed',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for reversed link syntax: (text)[url] instead of [text](url)
      const matches = line.matchAll(/\(([^)]+)\)\[(?:[^\]]+)\]/g)

      for (const match of matches) {
        const column = match.index! + 1
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column,
          ruleId: 'markdown/no-reversed-links',
          message: 'Reversed link syntax: should be [text](url) not (text)[url]',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
