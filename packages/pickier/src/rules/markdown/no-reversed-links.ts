import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

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
    // Skip fenced and indented code blocks — content there is not parsed
    // as markdown, so things like TypeScript's `import('x')['y']` (which
    // looks like reversed-link syntax `(text)[url]`) must not be flagged.
    // See https://github.com/pickier/pickier/issues/1355.
    const inCode = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
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
