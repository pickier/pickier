import type { RuleModule } from '../../types'

export const noDupeKeysRule: RuleModule = {
  meta: {
    docs: 'Disallow duplicate keys in object literals',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    // Pattern to match object literal start
    const objectStartPattern = /\{\s*$/
    // Pattern to match property key: identifier, string, or computed
    const propertyPattern = /^\s*(?:(['"`])(.+?)\1|(\w+))\s*:/

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Simple heuristic: look for lines that might start an object
      if (!objectStartPattern.test(line) && !line.includes('{'))
        continue

      // Find potential object block
      const seenKeys = new Map<string, number>()
      let braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      const _startLine = i

      // Parse properties in potential object
      for (let j = i + 1; j < lines.length && braceDepth > 0; j++) {
        const propLine = lines[j]
        braceDepth += (propLine.match(/\{/g) || []).length
        braceDepth -= (propLine.match(/\}/g) || []).length

        const match = propLine.match(propertyPattern)
        if (match) {
          // Extract key (either quoted string or identifier)
          const key = match[2] || match[3]
          if (key) {
            const previousLine = seenKeys.get(key)
            if (previousLine !== undefined) {
              issues.push({
                filePath: ctx.filePath,
                line: j + 1,
                column: Math.max(1, propLine.search(/\S/) + 1),
                ruleId: 'eslint/no-dupe-keys',
                message: `Duplicate key '${key}'`,
                severity: 'error',
              })
            }
            else {
              seenKeys.set(key, j)
            }
          }
        }

        if (braceDepth === 0)
          break
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    // Run check to find all duplicate keys
    const issues = noDupeKeysRule.check!(text, ctx)
    if (issues.length === 0)
      return text

    const lines = text.split(/\r?\n/)
    const linesToRemove = new Set(issues.map(issue => issue.line - 1))

    // Remove lines with duplicate keys
    const fixed = lines.filter((_, i) => !linesToRemove.has(i)).join('\n')
    return fixed
  },
}
