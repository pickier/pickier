import type { RuleModule } from '../../types'

export const noVarRule: RuleModule = {
  meta: {
    docs: 'Require let or const instead of var',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match var declarations (at word boundary, followed by whitespace and identifier)
      const varPattern = /\bvar\s+/g
      let match

      for (match = varPattern.exec(line); match !== null; match = varPattern.exec(line)) {
        // Skip if in comment
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-var',
          message: 'Unexpected var, use let or const instead',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const lines = text.split(/\r?\n/)

    // For each var, determine if it should be const or let based on reassignment
    // This is a simplified heuristic
    const fixed = lines.map((line) => {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('/*'))
        return line

      // Replace var with let by default (safe transformation)
      // A more sophisticated version would check for reassignment and use const where possible
      return line.replace(/\bvar\s+/g, 'let ')
    })

    return fixed.join('\n')
  },
}
