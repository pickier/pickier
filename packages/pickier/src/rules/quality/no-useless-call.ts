import type { RuleModule } from '../../types'

export const noUselessCallRule: RuleModule = {
  meta: {
    docs: 'Disallow unnecessary .call() and .apply()',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match patterns like: fn.call(undefined, ...) or fn.apply(undefined, ...)
      const callPattern = /\.\s*call\s*\(\s*(undefined|null)\s*,/g
      const applyPattern = /\.\s*apply\s*\(\s*(undefined|null)\s*,/g

      let match
      for (match = callPattern.exec(line); match !== null; match = callPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-useless-call',
          message: 'Unnecessary \'.call()\'',
          severity: 'error',
        })
      }

      for (match = applyPattern.exec(line); match !== null; match = applyPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-useless-call',
          message: 'Unnecessary \'.apply()\'',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
