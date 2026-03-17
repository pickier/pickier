import type { RuleModule } from '../../types'

export const noUselessRenameRule: RuleModule = {
  meta: {
    docs: 'Disallow renaming import, export, and destructured assignments to the same name',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match import { foo as foo }
      const importPattern = /import\s*\{[^}]*\b(\w+)\s+as\s+\1\b[^}]*\}/g
      let match

      for (match = importPattern.exec(line); match !== null; match = importPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-useless-rename',
          message: `Renaming import '${match[1]}' to '${match[1]}' is redundant`,
          severity: 'error',
        })
      }

      // Match export { foo as foo }
      const exportPattern = /export\s*\{[^}]*\b(\w+)\s+as\s+\1\b[^}]*\}/g
      for (match = exportPattern.exec(line); match !== null; match = exportPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-useless-rename',
          message: `Renaming export '${match[1]}' to '${match[1]}' is redundant`,
          severity: 'error',
        })
      }

      // Match const { foo: foo } = obj
      const destructPattern = /\{[^}]*\b(\w+)\s*:\s*\1\b[^}]*\}\s*=/g
      for (match = destructPattern.exec(line); match !== null; match = destructPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 1),
          ruleId: 'eslint/no-useless-rename',
          message: `Renaming destructured property '${match[1]}' to '${match[1]}' is redundant`,
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    let fixed = text

    // Remove redundant renames
    fixed = fixed.replace(/\b(\w+)\s+as\s+\1\b/g, '$1')
    fixed = fixed.replace(/\{([^}]*)\b(\w+)\s*:\s*\2\b([^}]*)\}/g, '{$1$2$3}')

    return fixed
  },
}
