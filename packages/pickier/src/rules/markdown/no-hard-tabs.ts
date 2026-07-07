import type { LintIssue, RuleModule } from '../../types'

/**
 * MD010 - Hard tabs
 */
export const noHardTabsRule: RuleModule = {
  meta: {
    docs: 'Spaces should be used instead of hard tabs',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks (tabs are often required, e.g. Makefiles)
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Check for hard tabs
      const tabIndex = line.indexOf('\t')

      if (tabIndex !== -1) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: tabIndex + 1,
          ruleId: 'markdown/no-hard-tabs',
          message: 'Hard tabs should not be used',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    // Replace tabs with 4 spaces (standard tab width) — but leave fenced
    // code untouched, mirroring check() (tabs are semantic in Makefiles)
    const lines = text.split(/\r?\n/)
    let inFence = false
    const fixed = lines.map((line) => {
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        return line
      }
      if (inFence)
        return line
      return line.replace(/\t/g, '    ')
    })
    return fixed.join('\n')
  },
}
