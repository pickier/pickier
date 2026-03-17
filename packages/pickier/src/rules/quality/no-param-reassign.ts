import type { RuleModule } from '../../types'

export const noParamReassignRule: RuleModule = {
  meta: {
    docs: 'Disallow reassignment of function parameters',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    const functionParams = new Map<string, Set<string>>() // Map of function names to their parameters

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match function declarations and arrow functions
      const funcMatches = [
        ...line.matchAll(/function\s+(?:(\w+)\s*)?\(([^)]*)\)/g),
        ...line.matchAll(/(?:const|let|var)?\s*(\w+)\s*=\s*\(([^)]*)\)\s*=>/g),
        ...line.matchAll(/(?:const|let|var)?\s*(\w+)\s*=\s*(\w+)\s*=>/g),
      ]

      for (const match of funcMatches) {
        const params = match[2] ? match[2].split(',').map(p => p.trim().split(/[=:]/)[0].trim()) : []
        const funcKey = `line-${i}`

        if (params.length > 0) {
          functionParams.set(funcKey, new Set(params.filter(p => p && /^\w+$/.test(p))))
        }
      }

      // Check for parameter reassignment (simple heuristic)
      for (const [funcKey, params] of functionParams.entries()) {
        for (const param of params) {
          // Match assignments to the parameter
          const assignPattern = new RegExp(`\\b${param}\\s*=\\s*[^=]`, 'g')

          let match
          for (match = assignPattern.exec(line); match !== null; match = assignPattern.exec(line)) {
            // Make sure it's not a comparison (==, ===)
            if (!line.slice(match.index).match(/^\w+\s*===?/)) {
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: match.index + 1,
                ruleId: 'eslint/no-param-reassign',
                message: `Assignment to function parameter '${param}'`,
                severity: 'error',
              })
            }
          }
        }
      }
    }

    return issues
  },
}
