import type { RuleModule } from '../../types'

export const noNewFuncRule: RuleModule = {
  meta: {
    docs: 'Disallow new Function() declarations',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match new Function(
      const funcPattern = /\bnew\s+Function\s*\(/g
      let match

      for (match = funcPattern.exec(line); match !== null; match = funcPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-new-func',
          message: 'The Function constructor is eval',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
