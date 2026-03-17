import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Disallow lazy quantifiers when they don't affect matching behavior
 *
 * Examples of useless lazy:
 * - /a+?$/ - lazy is useless because $ forces end-of-string
 * - /a*?b/ - lazy might be useless in some contexts
 */
export const noUselessLazy: RuleModule = {
  meta: {
    docs: 'Disallow lazy quantifiers that don\'t affect the matching behavior',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*'))
        continue

      // Find regex literals: /pattern/flags
      const regexPattern = /\/(?![/*])([^/\n\r\\]|\\.)+\/[gimsuvy]*/g
      let match

      for (match = regexPattern.exec(line); match !== null; match = regexPattern.exec(line)) {
        const regex = match[0]
        const pattern = regex.slice(1, regex.lastIndexOf('/'))

        // Check for lazy quantifiers followed by end-of-string anchors
        // Pattern: any lazy quantifier (+?, *?, ??) followed by $ or end of pattern
        if (/[+*?]\?\$$/.test(pattern)) {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: match.index + pattern.search(/[+*?]\?\$$/) + 2,
            ruleId: 'regexp/no-useless-lazy',
            message: 'Lazy quantifier is useless before end-of-string anchor',
            severity: 'error',
          })
        }

        // Check for lazy quantifiers at the end of the pattern
        if (/[+*?]\?$/.test(pattern)) {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: match.index + pattern.length - 1,
            ruleId: 'regexp/no-useless-lazy',
            message: 'Lazy quantifier is useless at the end of the pattern',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
