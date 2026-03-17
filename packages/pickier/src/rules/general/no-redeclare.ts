import type { RuleModule } from '../../types'

export const noRedeclareRule: RuleModule = {
  meta: {
    docs: 'Disallow variable redeclaration',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    // Track declarations (simple heuristic - function-scoped)
    const declared = new Map<string, number>() // varName -> line

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match variable declarations
      const declPattern = /\b(var|let|const)\s+(\w+)/g
      let match

      for (match = declPattern.exec(line); match !== null; match = declPattern.exec(line)) {
        const varName = match[2]
        const prevLine = declared.get(varName)

        if (prevLine !== undefined) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-redeclare',
            message: `'${varName}' is already defined`,
            severity: 'error',
          })
        }
        else {
          declared.set(varName, i)
        }
      }

      // Also check function declarations
      const funcPattern = /\bfunction\s+(\w+)/g
      for (match = funcPattern.exec(line); match !== null; match = funcPattern.exec(line)) {
        const funcName = match[1]
        const prevLine = declared.get(funcName)

        if (prevLine !== undefined) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-redeclare',
            message: `'${funcName}' is already defined`,
            severity: 'error',
          })
        }
        else {
          declared.set(funcName, i)
        }
      }
    }

    return issues
  },
}
