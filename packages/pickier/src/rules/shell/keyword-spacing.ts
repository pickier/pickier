import type { RuleModule } from '../../types'
import { heredocDelimiter, maskShellStrings } from './_shared'

/**
 * Enforce proper spacing around shell keywords.
 * Flags: `if(`, `then;cmd`, missing space after ; in control flow, etc.
 *
 * String/quote/expansion interiors are ignored via `maskShellStrings`, so
 * ANSI-C escape codes such as `$'\033[0;31m'` are not misread as having a
 * missing space after `;`.
 */
export const keywordSpacingRule: RuleModule = {
  meta: {
    docs: 'Enforce spacing around shell keywords (if, then, do, else, fi, etc.)',
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
      const delim = heredocDelimiter(line)
      if (delim) {
        inHeredoc = true
        heredocDelim = delim
      }

      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      const masked = maskShellStrings(line)

      // then/do/else/fi followed by content without space (e.g., `then echo`)
      // This checks for semicolon-separated: `; then` should have space after ;
      const semiNoSpace = masked.match(/;(?![;\s$])\S/)
      if (semiNoSpace) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: (semiNoSpace.index || 0) + 1,
          ruleId: 'shell/keyword-spacing',
          message: 'Missing space after semicolon',
          severity: 'warning',
        })
      }

      // `do` or `then` crammed against prior content without proper spacing
      // e.g., `done;do` or `command;then`
      const keywordCrammed = masked.match(/\w(then|do|else|elif|fi|done|esac)\b/)
      if (keywordCrammed && !/[a-z]/.test(masked[keywordCrammed.index!])) {
        // Make sure it's actually a keyword boundary
        const kw = keywordCrammed[1]
        const before = masked[keywordCrammed.index!]
        if (before !== ' ' && before !== '\t' && before !== ';') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: (keywordCrammed.index || 0) + 2,
            ruleId: 'shell/keyword-spacing',
            message: `Missing space before keyword '${kw}'`,
            severity: 'warning',
          })
        }
      }
    }
    return issues
  },
}
