import type { RuleModule } from '../../types'

/**
 * SC2086: Double quote variable expansions to prevent word splitting and globbing.
 * Unquoted $var is subject to word splitting and pathname expansion.
 */

// Contexts where unquoted variables are safe
const SAFE_CONTEXTS = [
  /^\s*(?:local|export|declare|typeset|readonly)\s+/, // assignments
  /\[\[.*\]\]/, // inside [[ ]] (no word splitting)
  /\(\(.*\)\)/, // inside (( )) (arithmetic)
]

// Match unquoted variable references: $var, ${var}, but not inside single quotes or already double-quoted
const VAR_PATTERN = /(?<!")\$(?:\{[A-Za-z_]\w*(?:[:#%\/][^}]*)?\}|[A-Za-z_]\w*)/g

export const quoteVariablesRule: RuleModule = {
  meta: {
    docs: 'Quote variable expansions to prevent word splitting and globbing',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''
    let heredocQuoted = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track heredoc boundaries
      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const heredocMatch = line.match(/<<-?\s*(['"])(\w+)\1/)
      if (heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch[2]
        heredocQuoted = true
        continue
      }
      const heredocMatch2 = line.match(/<<-?\s*(\w+)/)
      if (heredocMatch2 && !heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch2[1]
        heredocQuoted = false
      }

      // Skip comment lines
      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Check if line is in a safe context
      if (SAFE_CONTEXTS.some(re => re.test(line)))
        continue

      // Find unquoted variable references
      // We need to track quote context character by character
      let inSingleQuote = false
      let inDoubleQuote = false
      let j = 0

      while (j < line.length) {
        const ch = line[j]
        if (ch === '#' && !inSingleQuote && !inDoubleQuote) break
        if (ch === '\\' && !inSingleQuote) { j += 2; continue }
        if (ch === '\'' && !inDoubleQuote) { inSingleQuote = !inSingleQuote; j++; continue }
        if (ch === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; j++; continue }

        if (!inSingleQuote && !inDoubleQuote && ch === '$') {
          // Check if this is a variable reference
          const rest = line.slice(j)
          const match = rest.match(/^\$(?:\{[A-Za-z_]\w*(?:[:#%\/][^}]*)?\}|[A-Za-z_]\w*)/)
          if (match) {
            const varRef = match[0]
            // Skip special variables like $?, $!, $#, $@, $*
            if (!/^\$[?!#@*0-9-]/.test(varRef)) {
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: j + 1,
                ruleId: 'shell/quote-variables',
                message: `Unquoted variable ${varRef} — use "${varRef}" to prevent word splitting`,
                severity: 'warning',
                help: `Wrap in double quotes: "${varRef}"`,
              })
            }
            j += varRef.length
            continue
          }
        }
        j++
      }
    }
    return issues
  },
}
