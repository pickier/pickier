import type { LintIssue, RuleModule } from '../../types'

/**
 * MD030 - Spaces after list markers
 */
export const listMarkerSpaceRule: RuleModule = {
  meta: {
    docs: 'Spaces after list markers should be consistent',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { ul_single?: number, ul_multi?: number, ol_single?: number, ol_multi?: number }) || {}
    const ulSingle = options.ul_single || 1
    const olSingle = options.ol_single || 1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for unordered list item
      const ulMatch = line.match(/^(\s*)([*\-+])(\s+)/)
      if (ulMatch) {
        const spaces = ulMatch[3].length

        if (spaces !== ulSingle) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: ulMatch[1].length + 2,
            ruleId: 'markdown/list-marker-space',
            message: `Expected ${ulSingle} space${ulSingle !== 1 ? 's' : ''} after list marker, found ${spaces}`,
            severity: 'error',
          })
        }
      }

      // Check for ordered list item
      const olMatch = line.match(/^(\s*)(\d+\.)(\s+)/)
      if (olMatch) {
        const spaces = olMatch[3].length

        if (spaces !== olSingle) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: olMatch[1].length + olMatch[2].length + 1,
            ruleId: 'markdown/list-marker-space',
            message: `Expected ${olSingle} space${olSingle !== 1 ? 's' : ''} after list marker, found ${spaces}`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const options = (ctx.options as { ul_single?: number, ul_multi?: number, ol_single?: number, ol_multi?: number }) || {}
    const ulSingle = options.ul_single || 1
    const olSingle = options.ol_single || 1

    const lines = text.split(/\r?\n/)
    const fixedLines = lines.map((line) => {
      // Fix unordered list marker spacing
      line = line.replace(/^(\s*)([*\-+])\s+/, (_match, indent, marker) => {
        return `${indent}${marker}${' '.repeat(ulSingle)}`
      })

      // Fix ordered list marker spacing
      line = line.replace(/^(\s*)(\d+\.)\s+/, (_match, indent, marker) => {
        return `${indent}${marker}${' '.repeat(olSingle)}`
      })

      return line
    })
    return fixedLines.join('\n')
  },
}
