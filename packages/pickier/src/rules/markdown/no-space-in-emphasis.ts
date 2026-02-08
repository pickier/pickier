import type { LintIssue, RuleModule } from '../../types'

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
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Strip inline code spans to avoid false positives (use non-whitespace placeholder)
      const stripped = line.replace(/`[^`]+`/g, m => '\x01'.repeat(m.length))

      // Match complete paired emphasis with spaces just inside the markers
      // Only checks ** and __ (single * and _ are too ambiguous without a full parser)
      const patterns = [
        /\*\*\s+[^*]+?\*\*/g, // ** space...text ** (space after opening **)
        /\*\*[^*]+?\s+\*\*/g, // **text...space ** (space before closing **)
        /__\s+[^_]+?__/g, // __ space...text __ (space after opening __)
        /__[^_]+?\s+__/g, // __text...space __ (space before closing __)
      ]

      for (const pattern of patterns) {
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
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        result.push(line)
        continue
      }
      if (inFence) {
        result.push(line)
        continue
      }

      let fixed = line
      // Fix spaces inside ** emphasis
      fixed = fixed.replace(/\*\*\s+([^*]+?)\*\*/g, '**$1**')
      fixed = fixed.replace(/\*\*([^*]+?)\s+\*\*/g, '**$1**')
      // Fix spaces inside __ emphasis
      fixed = fixed.replace(/__\s+([^_]+?)__/g, '__$1__')
      fixed = fixed.replace(/__([^_]+?)\s+__/g, '__$1__')
      result.push(fixed)
    }

    return result.join('\n')
  },
}
