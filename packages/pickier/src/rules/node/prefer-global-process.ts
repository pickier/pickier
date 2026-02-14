import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Enforce using the global `process` instead of `require("process")`.
 * In Node.js, `process` is a global, so requiring it explicitly is unnecessary.
 *
 * Violations:
 * - Using `process` without importing (should use require("process"))
 */
export const preferGlobalProcess: RuleModule = {
  meta: {
    docs: 'Prefer using global process instead of requiring it',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    // Check if process is imported from "process" or "node:process" module
    const hasProcessImport = content.match(/(?:import|require)\s*\(?.*?['"](?:node:)?process['"]/)

    // If no import, check for process usage
    if (!hasProcessImport) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip comments
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))
          continue

        // Pattern: Using process as a global
        const processUsagePattern = /\bprocess\./
        if (processUsagePattern.test(line)) {
          // Check if it's not in a string
          const match = line.match(processUsagePattern)
          if (match) {
            const beforeMatch = line.slice(0, match.index)
            const singleQuotes = (beforeMatch.match(/'/g) || []).length
            const doubleQuotes = (beforeMatch.match(/"/g) || []).length
            const backticks = (beforeMatch.match(/`/g) || []).length

            // If odd number of quotes, we're inside a string
            if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1)
              continue

            const column = (match.index || 0) + 1

            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column,
              ruleId: 'node/prefer-global/process',
              message: 'Unexpected use of the global variable \'process\'. Use \'require("process")\' instead',
              severity: 'error',
              help: 'Import process explicitly: const process = require("process")',
            })
          }
        }
      }
    }

    return issues
  },
}
