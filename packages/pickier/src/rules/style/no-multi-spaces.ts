import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Disallow multiple consecutive spaces in code (except for indentation).
 * This rule helps maintain code readability by preventing excessive spacing.
 *
 * Violations:
 * - `const x  = 1` (multiple spaces before =)
 * - `foo(a,  b)` (multiple spaces after comma)
 */
export const noMultiSpaces: RuleModule = {
  meta: {
    docs: 'Disallow multiple consecutive spaces',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip empty lines
      if (!line.trim())
        continue

      // Find leading whitespace (indentation)
      const leadingWhitespace = line.match(/^(\s*)/)?.[1] || ''
      const codeAfterIndent = line.slice(leadingWhitespace.length)

      // Check for multiple consecutive spaces in the code portion (not indentation)
      // Pattern: 2+ spaces not at start of line
      const multiSpacePattern = / {2,}/g
      let match

      for (match = multiSpacePattern.exec(codeAfterIndent); match !== null; match = multiSpacePattern.exec(codeAfterIndent)) {
        const column = leadingWhitespace.length + match.index + 1

        // Skip if it's in a string literal
        const beforeMatch = codeAfterIndent.slice(0, match.index)
        const singleQuotes = (beforeMatch.match(/'/g) || []).length
        const doubleQuotes = (beforeMatch.match(/"/g) || []).length
        const backticks = (beforeMatch.match(/`/g) || []).length

        // If odd number of quotes before this point, we're likely inside a string
        if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1)
          continue

        // Skip if it's in a comment
        if (beforeMatch.includes('//'))
          continue
        if (line.trim().startsWith('*') || line.trim().startsWith('/*'))
          continue

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column,
          ruleId: 'style/no-multi-spaces',
          message: 'Multiple spaces found',
          severity: 'warning',
          help: 'Remove extra spaces. Use single spaces between tokens.',
        })
      }
    }

    return issues
  },
}
