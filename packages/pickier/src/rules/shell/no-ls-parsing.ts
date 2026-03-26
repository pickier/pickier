import type { RuleModule } from '../../types'

/**
 * SC2012: Don't parse the output of ls.
 * ls output is not safe for parsing — filenames can contain newlines, spaces, and special chars.
 * Use globs, find, or stat instead.
 */
export const noLsParsingRule: RuleModule = {
  meta: {
    docs: 'Disallow parsing ls output — use globs or find instead',
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

      // Pattern 1: ls piped to something: `ls | while`, `ls -la | grep`
      const lsPipeMatch = line.match(/\bls\b[^|]*\|/)
      if (lsPipeMatch) {
        const col = line.indexOf('ls')
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col + 1,
          ruleId: 'shell/no-ls-parsing',
          message: 'Don\'t parse ls output — filenames can contain special characters',
          severity: 'warning',
          help: 'Use globs (for f in *.txt), find (find . -name "*.txt"), or stat instead',
        })
        continue
      }

      // Pattern 2: command substitution with ls: `$(ls)`, `for f in $(ls)`
      const lsSubstMatch = line.match(/\$\(\s*ls\b/)
      if (lsSubstMatch) {
        const col = lsSubstMatch.index! + 1
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col,
          ruleId: 'shell/no-ls-parsing',
          message: 'Don\'t use ls in command substitution — use globs instead',
          severity: 'warning',
          help: 'Replace $(ls *.txt) with glob patterns: for f in *.txt; do ...; done',
        })
        continue
      }

      // Pattern 3: backtick ls: `ls`
      const lsBacktickMatch = line.match(/`\s*ls\b/)
      if (lsBacktickMatch) {
        const col = lsBacktickMatch.index! + 1
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col,
          ruleId: 'shell/no-ls-parsing',
          message: 'Don\'t use ls in command substitution — use globs instead',
          severity: 'warning',
          help: 'Replace `ls` with glob patterns',
        })
      }
    }
    return issues
  },
}
