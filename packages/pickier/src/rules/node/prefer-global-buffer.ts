import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Enforce using the global `Buffer` instead of importing it from the
 * `buffer` module. In Node.js `Buffer` is a global, so importing or
 * requiring it explicitly is unnecessary.
 *
 * Violations:
 * - `import { Buffer } from 'buffer'` / `'node:buffer'`
 * - `const { Buffer } = require('buffer')`
 */
export const preferGlobalBuffer: RuleModule = {
  meta: {
    docs: 'Prefer using global Buffer instead of requiring it',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    // Match an import or require of the `buffer` / `node:buffer` module.
    const importRe = /(?:import\b[^;\n]*\bfrom\s*|require\s*\(\s*)['"](?:node:)?buffer['"]/

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))
        continue

      const match = line.match(importRe)
      if (!match || match.index === undefined)
        continue

      // Only relevant when the module is being used for `Buffer`.
      if (!/\bBuffer\b/.test(line))
        continue

      issues.push({
        filePath: context.filePath,
        line: i + 1,
        column: match.index + 1,
        ruleId: 'node/prefer-global/buffer',
        message: 'Unexpected import of \'Buffer\'. Use the global \'Buffer\' instead',
        severity: 'error',
        help: '`Buffer` is a global in Node.js — remove the import and use it directly.',
      })
    }

    return issues
  },
}
