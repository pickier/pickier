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

    // Pre-compute comment ranges to skip (block comments and single-line comments)
    const commentRanges: Array<{ start: number, end: number }> = []
    const blockComment = /\/\*[\s\S]*?\*\//g
    let bc: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((bc = blockComment.exec(text))) {
      commentRanges.push({ start: bc.index, end: bc.index + bc[0].length })
    }
    const lineComment = /\/\/[^\n]*/g
    let lc: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((lc = lineComment.exec(text))) {
      commentRanges.push({ start: lc.index, end: lc.index + lc[0].length })
    }

    let m: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((m = regexLiteral.exec(text))) {
      const literal = m[0]
      const idx = m.index

      // Skip matches inside comments
      if (commentRanges.some(r => idx >= r.start && idx < r.end)) {
        continue
      }

      // Heuristic: skip likely division operators by checking what precedes the `/`
      // A `/` after ), ], an identifier char, or a digit is almost certainly division, not regex
      if (idx > 0) {
        const prevChar = text[idx - 1]
        if (prevChar === ')' || prevChar === ']' || prevChar === '.' || /[\w$]/.test(prevChar)) {
          continue
        }
        // Also skip if the content between slashes looks like an arithmetic expression
        // (contains spaces around operators, parentheses, etc.)
        const inner = literal.slice(1, literal.lastIndexOf('/'))
        if (/^\s+\w/.test(inner) && /\w\s*\)/.test(inner)) {
          continue
        }
      }

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
      // Check 3: Nested unlimited quantifiers like (.+)+ or (?:...)+
      // Only strip escaped parens (\( and \)) to avoid false positives, but keep other escapes
      if (/\((?:\?:)?[^)]*?[+*][^)]*\)\s*[+*]/.test(flat.replace(/\\[()]/g, '_'))) {
        mark(idx, literal.length, 'Nested unlimited quantifiers detected (e.g., (.+)+) which can cause catastrophic backtracking')
        continue
      }
    }
    return issues
  },
}
