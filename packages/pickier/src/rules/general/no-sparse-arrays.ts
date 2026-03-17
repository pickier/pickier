import type { RuleModule } from '../../types'

export const noSparseArraysRule: RuleModule = {
  meta: {
    docs: 'Disallow sparse arrays (arrays with empty slots)',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match array literals with consecutive commas (sparse arrays)
      // Examples: [1,,3] or [,,] or [1,,,4]
      const sparsePattern = /\[([^\]]*)\]/g
      let match

      for (match = sparsePattern.exec(line); match !== null; match = sparsePattern.exec(line)) {
        // Check if it's really sparse (not just trailing comma)
        const content = match[1]
        if (/,\s*,/.test(content)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-sparse-arrays',
            message: 'Unexpected sparse array',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const lines = text.split(/\r?\n/)
    let modified = false

    const fixed = lines.map((line) => {
      let newLine = line

      // Replace sparse arrays with explicit undefined
      newLine = newLine.replace(/\[([^\]]*)\]/g, (fullMatch, content) => {
        if (/,\s*,/.test(content)) {
          modified = true
          // Replace , , or ,, with , undefined,
          const fixedContent = content.replace(/,(\s*),/g, ', undefined,')
          return `[${fixedContent}]`
        }
        return fullMatch
      })

      return newLine
    })

    return modified ? fixed.join('\n') : text
  },
}
