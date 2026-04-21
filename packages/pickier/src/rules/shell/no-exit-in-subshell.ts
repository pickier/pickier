import type { RuleModule } from '../../types'

/**
 * SC2033: exit in subshell only exits the subshell, not the script.
 * Code like `(cd dir && exit 1)` won't stop the parent script.
 * Use return in functions, or restructure to avoid subshells.
 */
export const noExitInSubshellRule: RuleModule = {
  meta: {
    docs: 'Flag exit inside subshells where it only exits the subshell',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''
    let subshellDepth = 0

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

      // Track subshell depth by scanning for ( and ) outside quotes
      let inSQ = false
      let inDQ = false
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]
        if (ch === '#' && !inSQ && !inDQ)
          break
        if (ch === '\\' && !inSQ) {
          j++
          continue
        }
        if (ch === '\'' && !inDQ) {
          inSQ = !inSQ
          continue
        }
        if (ch === '"' && !inSQ) {
          inDQ = !inDQ
          continue
        }

        if (!inSQ && !inDQ) {
          // Explicit subshell with ( but not $( or ((
          if (ch === '(' && j > 0 && line[j - 1] !== '$' && line[j + 1] !== '(') {
            subshellDepth++
          }
          else if (ch === '(' && j === 0 && line[j + 1] !== '(') {
            subshellDepth++
          }
          else if (ch === ')' && subshellDepth > 0 && (j + 1 >= line.length || line[j + 1] !== ')')) {
            subshellDepth--
          }
        }
      }

      // Check for exit inside subshell
      if (subshellDepth > 0) {
        const exitMatch = line.match(/\bexit\b/)
        if (exitMatch) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: exitMatch.index! + 1,
            ruleId: 'shell/no-exit-in-subshell',
            message: 'exit inside a subshell only exits the subshell, not the script',
            severity: 'warning',
            help: 'Restructure to avoid subshells, or use return if inside a function',
          })
        }
      }

      // Also detect single-line subshell patterns: (cmd; exit 1)
      // Exclude $() command substitution and (( )) arithmetic
      if (subshellDepth === 0) {
        const inlineMatch = line.match(/(?<!\$)\((?!\()([^)]*\bexit\b[^)]*)\)(?!\))/)
        if (inlineMatch) {
          const col = line.indexOf('exit', inlineMatch.index!)
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: col + 1,
            ruleId: 'shell/no-exit-in-subshell',
            message: 'exit inside a subshell only exits the subshell, not the script',
            severity: 'warning',
            help: 'Restructure to avoid subshells, or use return if inside a function',
          })
        }
      }
    }
    return issues
  },
}
