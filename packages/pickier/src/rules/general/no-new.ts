import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Disallow `new` operators outside of assignments or comparisons.
 * Prevents using `new` for side effects without storing the result.
 *
 * Violations:
 * - `new MyClass()` (result not used)
 *
 * Valid:
 * - `const instance = new MyClass()`
 * - `return new MyClass()`
 */
export const noNew: RuleModule = {
  meta: {
    docs: 'Disallow new operators outside of assignments or comparisons',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Skip comments and strings
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))
        continue

      // Pattern: `new` at start of statement (not assigned, not returned, not passed)
      // Matches: `new Foo()` but not `const x = new Foo()` or `return new Foo()`
      const newPattern = /^\s*new\s+\w+/
      if (newPattern.test(line)) {
        // Check if it's part of an assignment, return, or argument
        const isAssignment = /^\s*(?:const|let|var|this\.\w+)\s*=\s*new\s+/
        const isReturn = /^\s*return\s+new\s+/
        const isArgument = /^\s*new\s+\w[^;]*,/ // Simplified check for arguments
        const isInExpression = /[=:,(]\s*new\s+/

        if (!isAssignment.test(line) && !isReturn.test(line) && !isArgument.test(line) && !isInExpression.test(trimmed)) {
          const column = line.search(/new\s+/) + 1

          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column,
            ruleId: 'no-new',
            message: 'Do not use \'new\' for side effects',
            severity: 'error',
            help: 'Either assign the result to a variable or remove the \'new\' operator if the side effect is intentional.',
          })
        }
      }
    }

    return issues
  },
}
