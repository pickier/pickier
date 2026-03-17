import type { RuleModule } from '../../types'

export const noExtraBooleanCastRule: RuleModule = {
  meta: {
    docs: 'Disallow unnecessary boolean casts',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match Boolean() in boolean contexts
      // In if/while/for conditions, ternary condition, !, &&, ||
      const patterns = [
        /\bif\s*\(\s*Boolean\s*\(/g,
        /\bwhile\s*\(\s*Boolean\s*\(/g,
        /!\s*Boolean\s*\(/g,
        /\?\s*Boolean\s*\(/g,
        /&&\s*Boolean\s*\(/g,
        /\|\|\s*Boolean\s*\(/g,
        /!!\s*\w+/g, // Double negation
      ]

      for (const pattern of patterns) {
        let match
        for (match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
          // Skip if in comment
          const beforeMatch = line.substring(0, match.index)
          if (beforeMatch.includes('//'))
            continue

          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-extra-boolean-cast',
            message: 'Redundant Boolean call or double negation',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text) => {
    let fixed = text

    // Remove Boolean() casts in if/while
    fixed = fixed.replace(/\b(if|while)\s*\(\s*Boolean\s*\(([^)]+)\)\s*\)/g, '$1 ($2)')

    // Remove ! before Boolean()
    fixed = fixed.replace(/!\s*Boolean\s*\(([^)]+)\)/g, '!$1')

    // Remove double negation
    fixed = fixed.replace(/!!\s*(\w+)/g, '$1')

    return fixed
  },
}
