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

      /*
       * Link text is everything between the brackets that is not a bracket.
       *
       * `[^\][]` rather than `.` matters more than it looks. With `.` the text
       * could run past its own closing bracket and pair with a *different*
       * link later in the line - so `- [ ] some prose ([phase 13](./x.md))`
       * matched from the task-list checkbox all the way to the real link's
       * `](url)`, read the whole line as link text beginning with a space, and
       * reported an error on ordinary markdown. Every task list item followed
       * by a link on the same line was a false positive.
       */
      const matches = line.matchAll(/\[([^\][]*)\]\([^)]*\)/g)

      for (const match of matches) {
        const linkText = match[1]

        // Leading or trailing whitespace of any kind, which is what MD039 is
        // about - a space *within* the text is ordinary prose.
        if (/^\s/.test(linkText) || /\s$/.test(linkText)) {
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
