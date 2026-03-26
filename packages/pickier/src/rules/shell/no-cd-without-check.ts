import type { RuleModule } from '../../types'

/**
 * SC2164: Use `cd ... || exit` or `cd ... || return` to handle cd failure.
 * If `cd` fails, subsequent commands run in the wrong directory.
 */
export const noCdWithoutCheckRule: RuleModule = {
  meta: {
    docs: 'Require error handling after cd commands',
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

      // Match standalone cd commands
      const cdMatch = trimmed.match(/^cd\s+/)
      if (!cdMatch) continue

      // Check if cd is followed by || or && or is part of an if/while condition
      const hasSafeGuard = /\|\||&&/.test(line)
      const isInCondition = /^\s*(?:if|elif|while|until)\s/.test(trimmed)
        || /\bif\s+cd\b/.test(line)
      const isInSubshell = /\(.*\bcd\b.*\)/.test(line)

      if (!hasSafeGuard && !isInCondition && !isInSubshell) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: cdMatch.index! + 1,
          ruleId: 'shell/no-cd-without-check',
          message: 'cd without error handling — if it fails, subsequent commands run in the wrong directory',
          severity: 'warning',
          help: 'Use: cd dir || exit 1 (or || return 1 inside functions)',
        })
      }
    }
    return issues
  },
}
