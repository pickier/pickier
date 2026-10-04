import type { RuleModule } from '../../types'
import { maskNonCode } from '../../lexer'

export const noUseBeforeDefineRule: RuleModule = {
  meta: {
    docs: 'Disallow the use of variables before they are defined',
    recommended: false,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    // Words in comments, strings and patterns are prose, not uses or
    // declarations: `// the caller's name` must not "use" a `name` declared below.
    const lines = maskNonCode(text).split(/\r?\n/)

    // Track variable declarations and their line numbers
    const declarations = new Map<string, number>()

    // First pass: collect all declarations
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const declMatches = [
        ...line.matchAll(/\b(const|let|var)\s+(\w+)/g),
        ...line.matchAll(/\bfunction\s+(\w+)\s*\(/g),
        ...line.matchAll(/\bclass\s+(\w+)/g),
      ]

      for (const match of declMatches) {
        const varName = match[2] || match[1]
        if (!declarations.has(varName)) {
          declarations.set(varName, i + 1)
        }
      }
    }

    // Second pass: check for usage before declaration
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip declaration lines themselves
      if (line.match(/\b(const|let|var|function|class)\s+\w+/)) {
        continue
      }

      // Find variable usage
      const usageMatches = line.matchAll(/\b(\w+)\b/g)

      for (const match of usageMatches) {
        const varName = match[1]

        // Check if this variable is declared later
        const declLine = declarations.get(varName)
        if (declLine && declLine > i + 1) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'eslint/no-use-before-define',
            message: `'${varName}' was used before it was defined`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
