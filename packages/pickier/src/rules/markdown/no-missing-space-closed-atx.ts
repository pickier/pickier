import type { LintIssue, RuleModule } from '../../types'

/**
 * MD020 - No space inside hashes on closed atx style heading
 */
export const noMissingSpaceClosedAtxRule: RuleModule = {
  meta: {
    docs: 'Closed ATX style headings must have spaces inside the hashes',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for closed ATX heading (has # at both ends)
      const match = line.match(/^(#{1,6})\s+(.+?)(#{1,6})\s*$/)

      if (match) {
        const openHashes = match[1]
        const content = match[2]
        const _closeHashes = match[3]

        // Check if there's no space before closing hashes
        if (!content.endsWith(' ')) {
          const column = openHashes.length + 1 + content.length
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column,
            ruleId: 'markdown/no-missing-space-closed-atx',
            message: 'No space inside hashes on closed atx style heading',
            severity: 'error',
          })
        }
      }

      // Also check if opening has no space
      const noOpenSpace = line.match(/^(#{1,6})(\S.+?#{1,6})\s*$/)
      if (noOpenSpace) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: noOpenSpace[1].length + 1,
          ruleId: 'markdown/no-missing-space-closed-atx',
          message: 'No space inside hashes on closed atx style heading',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
