import type { RuleModule } from '../../types'

export const noConstAssignRule: RuleModule = {
  meta: {
    docs: 'Disallow reassigning const variables',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    // Track const declarations
    const constVars = new Map<string, number>() // varName -> line declared

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Find const declarations
      const constMatch = line.match(/\bconst\s+(\w+)/)
      if (constMatch) {
        constVars.set(constMatch[1], i)
      }

      // Find assignments (excluding declarations)
      const assignPattern = /\b(\w+)\s*=(?!=)/g // matches = but not == or ===
      let match

      for (match = assignPattern.exec(line); match !== null; match = assignPattern.exec(line)) {
        const varName = match[1]

        // Check if this is an assignment (not a declaration)
        const beforeVar = line.substring(0, match.index)
        const isDeclaration = /\b(?:const|let|var)\s*$/.test(beforeVar)

        if (!isDeclaration && constVars.has(varName)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-const-assign',
            message: `'${varName}' is constant`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
