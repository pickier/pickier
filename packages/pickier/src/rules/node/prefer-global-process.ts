import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Enforce using the global `process` instead of importing it from the
 * `process` module. In Node.js `process` is a global, so importing or
 * requiring it explicitly is unnecessary.
 *
 * Violations:
 * - `import process from 'process'` / `'node:process'`
 * - `const process = require('process')`
 */
export const preferGlobalProcess: RuleModule = {
  meta: {
    docs: 'Prefer using global process instead of requiring it',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    // Match an import or require of the `process` / `node:process` module.
    const importRe = /(?:import\b[^;\n]*\bfrom\s*|require\s*\(\s*)['"](?:node:)?process['"]/

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))
        continue

      const match = line.match(importRe)
      if (!match || match.index === undefined)
        continue

      issues.push({
        filePath: context.filePath,
        line: i + 1,
        column: match.index + 1,
        ruleId: 'node/prefer-global/process',
        message: 'Unexpected import of \'process\'. Use the global \'process\' instead',
        severity: 'error',
        help: '`process` is a global in Node.js — remove the import and use it directly.',
      })
    }

    return issues
  },
}
