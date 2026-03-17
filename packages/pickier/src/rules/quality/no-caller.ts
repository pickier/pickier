import type { RuleModule } from '../../types'

export const noCallerRule: RuleModule = {
  meta: {
    docs: 'Disallow use of arguments.caller or arguments.callee',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match arguments.caller or arguments.callee
      const callerPattern = /\barguments\s*\.\s*(caller|callee)\b/g

      let match
      for (match = callerPattern.exec(line); match !== null; match = callerPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-caller',
          message: `Avoid arguments.${match[1]}`,
          severity: 'error',
        })
      }
    }

    return issues
  },
}
