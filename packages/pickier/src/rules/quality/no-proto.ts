import type { RuleModule } from '../../types'

export const noProtoRule: RuleModule = {
  meta: {
    docs: 'Disallow use of __proto__',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match __proto__ usage
      const protoPattern = /__proto__/g
      let match

      for (match = protoPattern.exec(line); match !== null; match = protoPattern.exec(line)) {
        // Skip if in comment or string literal
        const beforeMatch = line.substring(0, match.index)
        if (beforeMatch.includes('//'))
          continue

        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-proto',
          message: 'The \'__proto__\' property is deprecated',
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

      // Replace obj.__proto__ with Object.getPrototypeOf(obj)
      const replaced = line.replace(/(\w+)\.__proto__/g, (_, objName) => {
        modified = true
        return `Object.getPrototypeOf(${objName})`
      })

      return replaced
    })

    return modified ? fixed.join('\n') : text
  },
}
