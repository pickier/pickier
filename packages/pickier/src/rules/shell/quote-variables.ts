import type { RuleModule } from '../../types'
import { heredocDelimiter } from './_shared'

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

const VAR_AT_START = /^\$(?:\{[A-Za-z_]\w*(?:[:#%\/][^}]*)?\}|[A-Za-z_]\w*)/

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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track heredoc boundaries
      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      // String-aware: a << inside a quoted string is not a heredoc
      const delim = heredocDelimiter(line)
      if (delim) {
        inHeredoc = true
        heredocDelim = delim
        // Quoted delimiter (<< 'EOF') disables expansion — skip this line too
        if (new RegExp(`<<-?\\s*['"]${delim}['"]`).test(line))
          continue
      }

      // Skip comment lines
      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Check if line is in a safe context
      if (SAFE_CONTEXTS.some(re => re.test(line)))
        continue

      // Walk the line with a context stack so that nested
      // "$(cmd "$var")" expansions correctly treat `$var` as quoted.
      // Frames on the stack: 'dquote' | 'squote' | 'subshell'. A variable
      // reference is "quoted" if the innermost enclosing frame is a string
      // frame ('dquote' or 'squote'), independent of any surrounding
      // subshells.
      const stack: Array<'dquote' | 'squote' | 'subshell' | 'arith'> = []
      let j = 0
      while (j < line.length) {
        const top = stack[stack.length - 1]

        if (top === 'squote') {
          if (line[j] === '\'')
            stack.pop()
          j++
          continue
        }

        // Backslash escapes the next char outside single quotes.
        if (line[j] === '\\' && j + 1 < line.length) {
          j += 2
          continue
        }

        if (top === 'dquote') {
          const ch = line[j]
          if (ch === '"') {
            stack.pop()
            j++
            continue
          }
          if (ch === '$' && line[j + 1] === '(' && line[j + 2] === '(') {
            stack.push('arith')
            j += 3
            continue
          }
          if (ch === '$' && line[j + 1] === '(') {
            stack.push('subshell')
            j += 2
            continue
          }
          // $var / ${var} inside dquote → quoted, skip token.
          if (ch === '$') {
            const m = line.slice(j).match(VAR_AT_START)
            if (m) {
              j += m[0].length
              continue
            }
          }
          j++
          continue
        }

        if (top === 'arith') {
          const ch = line[j]
          if (ch === ')' && line[j + 1] === ')') {
            stack.pop()
            j += 2
            continue
          }
          // Variables inside arithmetic are treated as quoted (no word split).
          if (ch === '$') {
            const m = line.slice(j).match(VAR_AT_START)
            if (m) {
              j += m[0].length
              continue
            }
          }
          j++
          continue
        }

        // top is 'subshell' or undefined (outer shell)
        const ch = line[j]
        if (ch === '#' && (j === 0 || /\s/.test(line[j - 1])))
          break // comment
        if (ch === '\'') {
          stack.push('squote')
          j++
          continue
        }
        if (ch === '"') {
          stack.push('dquote')
          j++
          continue
        }
        if (ch === '$' && line[j + 1] === '(' && line[j + 2] === '(') {
          stack.push('arith')
          j += 3
          continue
        }
        if (ch === '$' && line[j + 1] === '(') {
          stack.push('subshell')
          j += 2
          continue
        }
        if (ch === ')' && top === 'subshell') {
          stack.pop()
          j++
          continue
        }

        if (ch === '$') {
          const m = line.slice(j).match(VAR_AT_START)
          if (m) {
            const varRef = m[0]
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
