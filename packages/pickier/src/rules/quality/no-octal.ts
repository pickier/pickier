import type { RuleModule } from '../../types'

export const noOctalRule: RuleModule = {
  meta: {
    docs: 'Disallow octal literals',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match octal literals: 0 followed by digits 0-7
      // But not 0x (hex) or 0b (binary) or 0o (explicit octal)
      const octalPattern = /\b0[0-7]+\b/g

      let match
      for (match = octalPattern.exec(line); match !== null; match = octalPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-octal',
          message: 'Octal literals should not be used',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
