import type { RuleModule } from '../../types'

/**
 * SC2016: Expressions don't expand in single quotes.
 * Detects cases where $var or ${var} appears inside single quotes,
 * which likely indicates the author intended double quotes.
 */
export const noVariableInSingleQuotesRule: RuleModule = {
  meta: {
    docs: 'Flag variables inside single quotes where they won\'t expand',
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

      // Find single-quoted strings containing $ references
      // Scan character by character to track quote state
      let inSQ = false
      let inDQ = false
      let sqStart = -1

      for (let j = 0; j < line.length; j++) {
        const ch = line[j]

        if (ch === '#' && !inSQ && !inDQ)
          break // rest is comment
        if (ch === '\\' && !inSQ) {
          j++
          continue
        }

        if (ch === '"' && !inSQ) {
          inDQ = !inDQ
          continue
        }

        if (ch === '\'' && !inDQ) {
          if (!inSQ) {
            inSQ = true
            sqStart = j
          }
          else {
            // End of single-quoted string — check contents
            const sqContent = line.slice(sqStart + 1, j)
            // Look for variable-like patterns: $var, ${var}, $(cmd)
            const varMatch = sqContent.match(/\$(?:[A-Za-z_]\w*|\{[^}]+\}|\([^)]*\))/)
            if (varMatch) {
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: sqStart + 1 + varMatch.index! + 1,
                ruleId: 'shell/no-variable-in-single-quotes',
                message: `Variable ${varMatch[0]} is inside single quotes and won't be expanded`,
                severity: 'warning',
                help: 'Use double quotes if you want variable expansion: "..." instead of \'...\'',
              })
            }
            inSQ = false
          }
        }
      }
    }
    return issues
  },
}
