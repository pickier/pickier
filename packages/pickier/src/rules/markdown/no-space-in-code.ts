import type { LintIssue, RuleModule } from '../../types'
import { mapInlineCodeAcrossLines } from './_fence-tracking'

/**
 * MD038 - Spaces inside code span elements
 */

/**
 * Whether a code span's padding is there to hold a backtick: CommonMark strips
 * one space from each end, so content that starts or ends with a backtick has
 * to be written `` `like this` `` - without the spaces, the backticks merge
 * with the delimiters (and three of them open a code fence).
 */
function padsBacktick(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.startsWith('`') || trimmed.endsWith('`')
}

export const noSpaceInCodeRule: RuleModule = {
  meta: {
    docs: 'Code span elements should not have spaces inside the backticks',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    mapInlineCodeAcrossLines(text.split('\n'), (span, line, column) => {
      const delimiterLength = span.match(/^`+/)![0].length
      const content = span.slice(delimiterLength, -delimiterLength)
      // Only flag if content has both leading and trailing spaces and non-empty trimmed content
      if (content.startsWith(' ') && content.endsWith(' ') && content.trim().length > 0
        && !(padsBacktick(content) && content === ` ${content.trim()} `)) {
        issues.push({
          filePath: ctx.filePath,
          line,
          column,
          ruleId: 'markdown/no-space-in-code',
          message: 'Spaces inside code span elements',
          severity: 'error',
        })
      }
      return span
    })

    return issues
  },
  fix: (text) => {
    return mapInlineCodeAcrossLines(text.split('\n'), (span) => {
      const backticks = span.match(/^`+/)![0]
      const content = span.slice(backticks.length, -backticks.length)
      if (content.startsWith(' ') && content.endsWith(' ') && content.trim().length > 0) {
        // Keep the one space each side that a backtick at either end needs
        return padsBacktick(content)
          ? `${backticks} ${content.trim()} ${backticks}`
          : `${backticks}${content.trim()}${backticks}`
      }
      return span
    }).join('\n')
  },
}
