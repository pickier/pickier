import type { RuleModule } from '../../types'

export const noSequencesRule: RuleModule = {
  meta: {
    docs: 'Disallow comma operators',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // This is complex to detect properly without AST
      // For now, look for comma operators in obvious places
      // Skip: function params, array literals, object literals

      // Look for comma outside of obvious contexts
      // Simplified heuristic: comma between statements in same line
      const suspiciousPattern = /\)\s*,\s*\w+\s*\(/g
      let match

      for (match = suspiciousPattern.exec(line); match !== null; match = suspiciousPattern.exec(line)) {
        // Skip if in comment
        if (line.substring(0, match.index).includes('//'))
          continue

        // Simple heuristic - may have false positives
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + match[0].indexOf(',') + 1),
          ruleId: 'eslint/no-sequences',
          message: 'Unexpected use of comma operator',
          severity: 'warning',
        })
      }
    }

    return issues
  },
}
