import type { RuleModule } from '../../types'

export const eqeqeqRule: RuleModule = {
  meta: {
    docs: 'Require === and !== instead of == and !=',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match == (but not ===) and != (but not !==)
      // Look ahead/behind to avoid matching === or !==
      const eqPattern = /([^=!])(\s*)(==)(\s*)([^=])/g
      const neqPattern = /([^!])(\s*)(!=)(\s*)([^=])/g

      let match
      for (match = eqPattern.exec(line); match !== null; match = eqPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 2), // +2 to skip the first character
          ruleId: 'eslint/eqeqeq',
          message: 'Expected \'===\' and instead saw \'==\'',
          severity: 'error',
        })
      }

      for (match = neqPattern.exec(line); match !== null; match = neqPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, match.index + 2), // +2 to skip the first character
          ruleId: 'eslint/eqeqeq',
          message: 'Expected \'!==\' and instead saw \'!=\'',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    let fixed = text

    // Replace != with !== (do this first to avoid conflicts)
    // Use word boundaries and lookahead to avoid replacing !==
    fixed = fixed.replace(/([^!])(\s*)(!=)(\s*)([^=])/g, '$1$2!==$4$5')

    // Replace == with === (avoid replacing ===)
    fixed = fixed.replace(/([^=!])(\s*)(==)(\s*)([^=])/g, '$1$2===$4$5')

    return fixed
  },
}
