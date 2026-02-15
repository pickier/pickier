import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Enforce consistent brace style for blocks.
 * Default: "1tbs" (one true brace style) - opening brace on same line, closing brace on new line.
 *
 * Detects violations like:
 * - Closing brace on same line as next block (else, catch, finally, etc.)
 * - Opening brace on new line instead of same line
 */
export const braceStyle: RuleModule = {
  meta: {
    docs: 'Enforce consistent brace style for blocks',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue

      // Check for closing brace followed by else/catch/finally on same line
      const closingBraceWithNext = /\}\s+(else|catch|finally)\b/
      if (closingBraceWithNext.test(trimmed)) {
        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: trimmed.indexOf('}') + 1,
          ruleId: 'style/brace-style',
          message: 'Closing curly brace appears on the same line as the subsequent block',
          severity: 'error',
        })
      }

      // Check for opening brace on new line (should be on same line for 1tbs style)
      // This detects cases where the opening { is alone on its own line
      if (trimmed === '{' && i > 0) {
        const prevLine = lines[i - 1].trim()
        // Skip standalone block scopes (previous line is empty or a comment)
        if (!prevLine || prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.endsWith('*/'))
          continue
        // Only flag if previous line ends with something that should have { on same line
        if (prevLine && !prevLine.endsWith('{') && !prevLine.endsWith(',') && !prevLine.endsWith('(')) {
          // Check if it's not part of an object literal or array
          if (!prevLine.match(/[=:]\s*$/) && !prevLine.endsWith('[')) {
            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'style/brace-style',
              message: 'Opening curly brace should be on the same line',
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
}
