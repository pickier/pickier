import type { LintIssue, RuleModule } from '../../types'
import { replaceOutsideInlineCode } from './_fence-tracking'

// Spaces just inside a *genuine* emphasis span. The leading `(?<![A-Za-z0-9])`
// / trailing `(?![A-Za-z0-9])` flanking guards keep the closing `**` of one
// span and the opening `**` of the next from being mistaken for a single span
// with "interior" spaces — e.g. `**caddy** and **nginx**` must stay untouched.
const EMPHASIS_SPACE_PATTERNS = [
  /(?<![A-Za-z0-9])\*\*\s+[^*]+?\*\*(?![A-Za-z0-9])/g, // ** text **  (space after opening)
  /(?<![A-Za-z0-9])\*\*[^*]+?\s+\*\*(?![A-Za-z0-9])/g, // **text **   (space before closing)
  /(?<![A-Za-z0-9])__\s+[^_]+?__(?![A-Za-z0-9])/g, //     __ text __  (space after opening)
  /(?<![A-Za-z0-9])__[^_]+?\s+__(?![A-Za-z0-9])/g, //     __text __   (space before closing)
]

/**
 * MD037 - Spaces inside emphasis markers
 */
export const noSpaceInEmphasisRule: RuleModule = {
  meta: {
    docs: 'Emphasis markers should not have spaces inside them',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Strip inline code spans to avoid false positives (use non-whitespace placeholder)
      const stripped = line.replace(/`[^`]+`/g, m => '\x01'.repeat(m.length))

      // Match complete paired emphasis with spaces just inside the markers
      // Only checks ** and __ (single * and _ are too ambiguous without a full parser)
      for (const pattern of EMPHASIS_SPACE_PATTERNS) {
        for (const match of stripped.matchAll(pattern)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/no-space-in-emphasis',
            message: 'Spaces inside emphasis markers',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    let inFence = false
    const result: string[] = []

    for (const line of lines) {
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        result.push(line)
        continue
      }
      if (inFence) {
        result.push(line)
        continue
      }

      // Rewrite only outside inline code spans, with the same flanking guards
      // as the checker so adjacent emphasis spans (`**a** and **b**`) and
      // markers inside `` `code` `` are left alone.
      const fixed = replaceOutsideInlineCode(line, (seg) => {
        let s = seg
        // Fix spaces inside ** emphasis
        s = s.replace(/(?<![A-Za-z0-9])(\*\*)\s+([^*]+?)\*\*(?![A-Za-z0-9])/g, '$1$2**')
        s = s.replace(/(?<![A-Za-z0-9])(\*\*)([^*]+?)\s+\*\*(?![A-Za-z0-9])/g, '$1$2**')
        // Fix spaces inside __ emphasis
        s = s.replace(/(?<![A-Za-z0-9])(__)\s+([^_]+?)__(?![A-Za-z0-9])/g, '$1$2__')
        s = s.replace(/(?<![A-Za-z0-9])(__)([^_]+?)\s+__(?![A-Za-z0-9])/g, '$1$2__')
        return s
      })
      result.push(fixed)
    }

    return result.join('\n')
  },
}
