import type { RuleModule } from '../../types'

export const noNewWrappersRule: RuleModule = {
  meta: {
    docs: 'Disallow new operators with String, Number, and Boolean',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match new String/Number/Boolean
      const wrapperPattern = /\bnew\s+(String|Number|Boolean)\s*\(/g
      let match

      for (match = wrapperPattern.exec(line); match !== null; match = wrapperPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-new-wrappers',
          message: `Do not use ${match[1]} as a constructor`,
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    let modified = false

    const fixed = lines.map((line) => {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('/*'))
        return line

      // Replace new String() with String()
      const replaced = line.replace(/\bnew\s+(String|Number|Boolean)\s*\(/g, (_, wrapper) => {
        modified = true
        return `${wrapper}(`
      })

      return replaced
    })

    return modified ? fixed.join('\n') : text
  },
}
