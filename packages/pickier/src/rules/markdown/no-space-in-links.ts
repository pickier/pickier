import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD039 - Spaces inside link text
 */
export const noSpaceInLinksRule: RuleModule = {
  meta: {
    docs: 'Link text should not have leading or trailing spaces',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]

      // Check for spaces inside link text [  text  ](url)
      const matches = line.matchAll(/\[(\s+(?:\S.*?|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])|\s*(?:\S.*?|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])\s+)\]\([^)]+\)/g)

      for (const match of matches) {
        const linkText = match[1]
        if (linkText.startsWith(' ') || linkText.endsWith(' ')) {
          const column = match.index! + 1
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column,
            ruleId: 'markdown/no-space-in-links',
            message: 'Spaces inside link text',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
