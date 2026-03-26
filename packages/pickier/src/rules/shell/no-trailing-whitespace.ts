import type { RuleModule } from '../../types'

/**
 * Disallow trailing whitespace in shell scripts.
 */
export const noTrailingWhitespaceRule: RuleModule = {
  meta: {
    docs: 'Disallow trailing whitespace',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Inside heredocs, trailing whitespace may be intentional
      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?/)
      if (heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch[1]
      }

      if (/[ \t]+$/.test(line)) {
        const trailingMatch = line.match(/[ \t]+$/)!
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: trailingMatch.index! + 1,
          ruleId: 'shell/no-trailing-whitespace',
          message: 'Trailing whitespace',
          severity: 'error',
        })
      }
    }
    return issues
  },
  fix(content) {
    return content.replace(/[ \t]+$/gm, '')
  },
}
