import type { RuleModule } from '../../types'

export const forDirectionRule: RuleModule = {
  meta: {
    docs: 'Enforce "for" loop update clause moving counter in the right direction',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match for loops: for (let i = 0; i < n; i++)
      const forLoopRe = new RegExp(
        '\\bfor\\s*\\(\\s*(?:(?:let|var|const)\\s*)?(\\w+)\\s*=[^'
        + ';]+' + ';' + '\\s*(\\w+)\\s*([<>]=?)[^'
        + ';]+' + ';' + '\\s*(\\w+)(\\+\\+|--|[\\s+-]=)',
      )
      const forMatch = line.match(forLoopRe)

      if (forMatch) {
        const initVar = forMatch[1]
        const condVar = forMatch[2]
        const operator = forMatch[3] // < or > or <= or >=
        const updateVar = forMatch[4]
        const updateOp = forMatch[5] // ++ or -- or +=  or -=

        // Check if the same variable is used throughout
        if (initVar === condVar && condVar === updateVar) {
          // Check for direction mismatch
          const isIncreasing = updateOp.includes('+')
          const expectsLess = operator.includes('<')

          // If condition uses < but update decrements, or condition uses > but update increments
          if ((expectsLess && !isIncreasing) || (!expectsLess && isIncreasing)) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'eslint/for-direction',
              message: 'The update clause in this loop moves the variable in the wrong direction',
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
}
