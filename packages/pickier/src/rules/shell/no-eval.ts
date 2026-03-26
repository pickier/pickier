import type { RuleModule } from '../../types'

/**
 * Disallow use of eval in shell scripts.
 * eval is dangerous because it re-parses its arguments, leading to code injection risks.
 */
export const noEvalRule: RuleModule = {
  meta: {
    docs: 'Disallow use of eval in shell scripts',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

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

      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Match `eval` as a command word (not inside strings, not as part of another word)
      const evalMatch = line.match(/(?:^|[;&|]\s*|^\s+)eval\s/)
      if (evalMatch) {
        const col = line.indexOf('eval')
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col + 1,
          ruleId: 'shell/no-eval',
          message: 'Avoid using eval — it re-parses arguments and can lead to code injection',
          severity: 'error',
          help: 'Refactor to avoid eval. Consider using arrays for dynamic commands or indirect variable references with ${!var}',
        })
      }
    }
    return issues
  },
}
