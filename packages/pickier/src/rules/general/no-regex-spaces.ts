import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Disallow multiple spaces in regular expressions.
 * Use quantifiers like {2} instead for clarity.
 *
 * Violations:
 * - `/foo  bar/` (use /foo {2}bar/ instead)
 * - `/  +/` (multiple spaces)
 */
export const noRegexSpaces: RuleModule = {
  meta: {
    docs: 'Disallow multiple spaces in regular expressions',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comment-only lines (// and ///)
      if (/^\s*\/\//.test(line))
        continue

      // Find regex literals: /.../ or new RegExp('...')
      // Pattern for regex literals
      const regexLiteralPattern = /\/(?![*/])((?:\\.|[^/\\])+)\/[gimsuvy]*/g
      let match

      while ((match = regexLiteralPattern.exec(line)) !== null) {
        const regexContent = match[1]

        // Check for multiple consecutive spaces in the regex
        if (/ {2,}/.test(regexContent)) {
          const column = match.index + 1

          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column,
            ruleId: 'no-regex-spaces',
            message: 'Multiple spaces in regular expression',
            severity: 'error',
            help: 'Use quantifiers like {2} instead of multiple spaces for clarity.',
          })
        }
      }

      // Also check RegExp constructor
      const regExpPattern = /new\s+RegExp\s*\(\s*['"`]([^'"`]+)['"`]/g
      while ((match = regExpPattern.exec(line)) !== null) {
        const regexContent = match[1]

        if (/ {2,}/.test(regexContent)) {
          const column = match.index + 1

          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column,
            ruleId: 'no-regex-spaces',
            message: 'Multiple spaces in regular expression',
            severity: 'error',
            help: 'Use quantifiers like {2} instead of multiple spaces for clarity.',
          })
        }
      }
    }

    return issues
  },
}
