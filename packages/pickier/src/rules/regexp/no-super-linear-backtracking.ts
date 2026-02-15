/* eslint-disable regexp/no-super-linear-backtracking */
import type { RuleModule } from '../../types'

export const noSuperLinearBacktrackingRule: RuleModule = {
  meta: { docs: 'Detects potentially super-linear backtracking patterns in regex literals (heuristic)' },
  check: (text, ctx) => {
    const issues = [] as ReturnType<RuleModule['check']>
    const regexLiteral = /\/[^/\\\n]*(?:\\.[^/\\\n]*)*\//g
    const mark = (idx: number, _len: number, msg: string) => {
      const before = text.slice(0, idx)
      const line = (before.match(/\n/g) || []).length + 1
      const col = idx - before.lastIndexOf('\n')
      issues.push({ filePath: ctx.filePath, line, column: col, ruleId: 'no-super-linear-backtracking', message: msg, severity: 'error' })
    }
    let m: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((m = regexLiteral.exec(text))) {
      const literal = m[0]
      const idx = m.index
      const patt = literal.slice(1, literal.lastIndexOf('/'))
      const flat = patt.replace(/\[.*?\]/g, '')
      const exch = flat.includes('.+?\\s*') || flat.includes('\\s*.+?') || flat.includes('.*\\s*') || flat.includes('\\s*.*')
      if (exch) {
        mark(idx, literal.length, 'The combination of \' .*\' or \' .+?\' with \'\\s*\' can cause super-linear backtracking due to exchangeable characters')
        continue
      }
      const collapsed = flat.replace(/\s+/g, '')
      if (/(?:\.\*\??){2,}/.test(collapsed) || /(?:\.\+\??){2,}/.test(collapsed) || /\.\*\??\.\+\??|\.\+\??\.\*\??/.test(collapsed)) {
        mark(idx, literal.length, 'Multiple adjacent unlimited wildcard quantifiers can cause super-linear backtracking')
        continue
      }
      // Strip escaped characters before checking nested quantifiers
      // so that \( is not mistaken for a group opener
      if (/\((?:\?:)?[^)]*?[+*][^)]*\)\s*[+*]/.test(flat.replace(/\\./g, ''))) {
        mark(idx, literal.length, 'Nested unlimited quantifiers detected (e.g., (.+)+) which can cause catastrophic backtracking')
        continue
      }
    }
    return issues
  },
}
