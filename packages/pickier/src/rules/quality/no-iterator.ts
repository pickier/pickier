import type { RuleModule } from '../../types'

export const noIteratorRule: RuleModule = {
  meta: {
    docs: 'Disallow the use of the __iterator__ property',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const pattern = /__iterator__/g
      let match

      for (match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
        // Skip if in comment
        if (line.substring(0, match.index).includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-iterator',
          message: 'Reserved name \'__iterator__\'',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
