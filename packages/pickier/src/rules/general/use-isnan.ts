import type { RuleModule } from '../../types'

export const useIsNaNRule: RuleModule = {
  meta: {
    docs: 'Require isNaN() when checking for NaN',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match comparisons with NaN
      const nanPattern = /\b(\w+(?:\.\w+|\[[^\]]+\])*)\s*(===|!==|==|!=)\s*NaN\b|\bNaN\s*(===|!==|==|!=)\s*(\w+(?:\.\w+|\[[^\]]+\])*)/g
      let match

      while ((match = nanPattern.exec(line)) !== null) {
        const _variable = match[1] || match[4]
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/use-isnan',
          message: 'Use isNaN() to compare with NaN',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const lines = text.split(/\r?\n/)
    let modified = false

    const fixed = lines.map((line) => {
      let newLine = line

      // Replace x === NaN or NaN === x with isNaN(x)
      newLine = newLine.replace(/\b(\w+(?:\.\w+|\[[^\]]+\])*)\s*===\s*NaN\b/g, (_, varName) => {
        modified = true
        return `isNaN(${varName})`
      })
      newLine = newLine.replace(/\bNaN\s*===\s*(\w+(?:\.\w+|\[[^\]]+\])*)\b/g, (_, varName) => {
        modified = true
        return `isNaN(${varName})`
      })

      // Replace x !== NaN or NaN !== x with !isNaN(x)
      newLine = newLine.replace(/\b(\w+(?:\.\w+|\[[^\]]+\])*)\s*!==\s*NaN\b/g, (_, varName) => {
        modified = true
        return `!isNaN(${varName})`
      })
      newLine = newLine.replace(/\bNaN\s*!==\s*(\w+(?:\.\w+|\[[^\]]+\])*)\b/g, (_, varName) => {
        modified = true
        return `!isNaN(${varName})`
      })

      // Replace x == NaN or NaN == x with isNaN(x)
      newLine = newLine.replace(/\b(\w+(?:\.\w+|\[[^\]]+\])*)\s*==\s*NaN\b/g, (_, varName) => {
        modified = true
        return `isNaN(${varName})`
      })
      newLine = newLine.replace(/\bNaN\s*==\s*(\w+(?:\.\w+|\[[^\]]+\])*)\b/g, (_, varName) => {
        modified = true
        return `isNaN(${varName})`
      })

      // Replace x != NaN or NaN != x with !isNaN(x)
      newLine = newLine.replace(/\b(\w+(?:\.\w+|\[[^\]]+\])*)\s*!=\s*NaN\b/g, (_, varName) => {
        modified = true
        return `!isNaN(${varName})`
      })
      newLine = newLine.replace(/\bNaN\s*!=\s*(\w+(?:\.\w+|\[[^\]]+\])*)\b/g, (_, varName) => {
        modified = true
        return `!isNaN(${varName})`
      })

      return newLine
    })

    return modified ? fixed.join('\n') : text
  },
}
