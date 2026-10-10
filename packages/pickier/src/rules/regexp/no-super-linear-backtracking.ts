/* eslint-disable regexp/no-super-linear-backtracking */
import type { RuleModule } from '../../types'
import { lexSource } from '../../lexer'

export const noSuperLinearBacktrackingRule: RuleModule = {
  meta: { docs: 'Detects potentially super-linear backtracking patterns in regex literals (heuristic)' },
  check: (text, ctx) => {
    const issues = [] as ReturnType<RuleModule['check']>
    const mark = (idx: number, _len: number, msg: string) => {
      const before = text.slice(0, idx)
      const line = (before.match(/\n/g) || []).length + 1
      const col = idx - before.lastIndexOf('\n')
      issues.push({ filePath: ctx.filePath, line, column: col, ruleId: 'no-super-linear-backtracking', message: msg, severity: 'error' })
    }

    // The lexer distinguishes patterns from division, comments and strings,
    // and keeps regexes inside template expressions visible.
    for (const region of lexSource(text).regions) {
      if (region.kind !== 'regex')
        continue
      const idx = region.start - 1
      const literal = text.slice(idx, region.end + 1)

      const patt = literal.slice(1, literal.lastIndexOf('/'))
      const flat = patt.replace(/\[.*?\]/g, '')
      const exch = flat.includes('.+?\\s*') || flat.includes('\\s*.+?') || flat.includes('.*\\s*') || flat.includes('\\s*.*')
      if (exch) {
        mark(idx, literal.length, 'The combination of \' .*\' or \' .+?\' with \'\\s*\' can cause super-linear backtracking due to exchangeable characters')
        continue
      }
      const collapsed = flat.replace(/\s+/g, '')
      if (/(?:\.\*\??){2,}/.test(collapsed) || /(?:\.\+\??){2,}/.test(collapsed) || /\.\*\??\.\+\?|\.\+\??\.\*\?/.test(collapsed)) {
        mark(idx, literal.length, 'Multiple adjacent unlimited wildcard quantifiers can cause super-linear backtracking')
        continue
      }
      // Check 3: Nested unlimited quantifiers like (.+)+ or (?:...)+
      //
      // Two normalizations happen first, and both exist to stop the pattern
      // below from reading characters as syntax that the author wrote as text.
      //
      // Escapes go first. `\*`, `\+` and `\?` are literal characters, not
      // quantifiers, and `\(`/`\)` are literal parens; collapsing every escape
      // pair to one placeholder settles all of them together. Previously only
      // `\(` and `\)` were collapsed, so a group opening on a literal asterisk
      // — `/(\* @version `)[^`]*\(/`, a perfectly linear pattern — counted that
      // asterisk as an unlimited quantifier inside the group and was reported.
      //
      // Then character classes collapse to a single atom, keeping whatever
      // quantifier follows them. Working from `patt` rather than `flat` is the
      // point: `flat` had already dropped the brackets and left the quantifier
      // stranded against the preceding token, manufacturing a `)*` that appears
      // nowhere in the source. Keeping the quantifier attached to the atom is
      // what lets a genuinely nested `([a-z]+)+` still be caught.
      const atoms = patt.replace(/\\./g, '_').replace(/\[[^\]]*\]/g, '_')
      if (/\((?:\?:)?[^)]*?[+*][^)]*\)\s*[+*]/.test(atoms)) {
        mark(idx, literal.length, 'Nested unlimited quantifiers detected (e.g., (.+)+) which can cause catastrophic backtracking')
        continue
      }
    }
    return issues
  },
}
