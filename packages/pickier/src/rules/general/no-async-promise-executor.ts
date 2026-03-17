import type { RuleModule } from '../../types'

export const noAsyncPromiseExecutorRule: RuleModule = {
  meta: {
    docs: 'Disallow async functions as Promise executor',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match: new Promise(async ...)
      const asyncPromisePattern = /new\s+Promise\s*\(\s*async\s*(?:\(|function)/g

      let match
      for (match = asyncPromisePattern.exec(line); match !== null; match = asyncPromisePattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-async-promise-executor',
          message: 'Promise executor functions should not be async',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
