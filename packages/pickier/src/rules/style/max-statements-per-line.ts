import type { RuleModule } from '../../types'

export const maxStatementsPerLineRule: RuleModule = {
  meta: { docs: 'Limit the number of statements allowed on a single line' },
  check: (text, ctx) => {
    const max: number = (ctx.options && typeof (ctx.options as any).max === 'number') ? (ctx.options as any).max : 1
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    const countStatementsOnLine = (line: string): number => {
      const commentIdx = findLineCommentStart(line)
      const effective = commentIdx >= 0 ? line.slice(0, commentIdx) : line
      let countSemis = 0
      let inSingle = false
      let inDouble = false
      let inBacktick = false
      let inRegex = false
      let inRegexClass = false
      let escape = false
      let inForHeader = false
      let parenDepth = 0
      // Track the last significant (non-whitespace, non-comment) token so we
      // can distinguish regex literals from division at `/`. In JS a `/` is
      // a regex delimiter when it follows a token that cannot be the left
      // operand of division (operators, punctuators, keywords like
      // `return`/`typeof`), and is division otherwise.
      let lastSignificant = ''
      const updateSignificant = (ch: string) => {
        if (ch === ' ' || ch === '\t')
          return
        lastSignificant = ch
      }

      for (let i = 0; i < effective.length; i++) {
        const ch = effective[i]
        if (escape) {
          escape = false
          continue
        }
        if (ch === '\\') {
          escape = true
          continue
        }
        if (inRegex) {
          if (inRegexClass) {
            if (ch === ']')
              inRegexClass = false
            continue
          }
          if (ch === '[') {
            inRegexClass = true
            continue
          }
          if (ch === '/') {
            inRegex = false
            // skip trailing flags
            while (i + 1 < effective.length && /[a-z]/i.test(effective[i + 1]))
              i++
            lastSignificant = '/'
          }
          continue
        }
        if (!inDouble && !inBacktick && ch === '\'') {
          inSingle = !inSingle
          updateSignificant(inSingle ? '\'' : 'x')
          continue
        }
        if (!inSingle && !inBacktick && ch === '"') {
          inDouble = !inDouble
          updateSignificant(inDouble ? '"' : 'x')
          continue
        }
        if (!inSingle && !inDouble && ch === '`') {
          inBacktick = !inBacktick
          updateSignificant(inBacktick ? '`' : 'x')
          continue
        }
        if (inSingle || inDouble || inBacktick)
          continue
        if (ch === '/' && isRegexContext(lastSignificant, effective, i)) {
          inRegex = true
          continue
        }
        if (!inForHeader) {
          if (ch === 'f' && effective.slice(i, i + 4).match(/^for\b/)) {
            const rest = effective.slice(i + 3).trimStart()
            const offset = effective.length - rest.length
            if (effective[offset] === '(') {
              inForHeader = true
              parenDepth = 1
              i = offset
              lastSignificant = '('
              continue
            }
          }
        }
        else {
          if (ch === '(') {
            parenDepth++
          }
          else if (ch === ')') {
            parenDepth--
            if (parenDepth <= 0)
              inForHeader = false
          }
          else if (ch === ';') {
            updateSignificant(ch)
            continue
          }
        }
        if (ch === ';')
          countSemis++
        updateSignificant(ch)
      }
      if (countSemis === 0)
        return 1
      const trimmed = effective.trimEnd()
      const endsWithSemi = trimmed.endsWith(';')
      return endsWithSemi ? countSemis : countSemis + 1
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^\s*$/.test(line))
        continue
      const num = countStatementsOnLine(line)
      if (num > max) {
        issues.push({ filePath: ctx.filePath, line: i + 1, column: 1, ruleId: 'max-statements-per-line', message: `This line has ${num} statements. Maximum allowed is ${max}`, severity: 'warning' })
      }
    }
    return issues
  },
}

function findLineCommentStart(line: string): number {
  // Locate `//` that is not inside a string or regex literal on the line.
  let inSingle = false
  let inDouble = false
  let inBacktick = false
  let inRegex = false
  let inRegexClass = false
  let escape = false
  let lastSig = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (inRegex) {
      if (inRegexClass) {
        if (ch === ']')
          inRegexClass = false
        continue
      }
      if (ch === '[') {
        inRegexClass = true
        continue
      }
      if (ch === '/') {
        inRegex = false
        while (i + 1 < line.length && /[a-z]/i.test(line[i + 1]))
          i++
        lastSig = '/'
      }
      continue
    }
    if (!inDouble && !inBacktick && ch === '\'') {
      inSingle = !inSingle
      lastSig = ch
      continue
    }
    if (!inSingle && !inBacktick && ch === '"') {
      inDouble = !inDouble
      lastSig = ch
      continue
    }
    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick
      lastSig = ch
      continue
    }
    if (inSingle || inDouble || inBacktick)
      continue
    if (ch === '/' && line[i + 1] === '/')
      return i
    if (ch === '/' && isRegexContext(lastSig, line, i)) {
      inRegex = true
      continue
    }
    if (ch !== ' ' && ch !== '\t')
      lastSig = ch
  }
  return -1
}

function isRegexContext(lastSignificant: string, effective: string, idx: number): boolean {
  // At start of line, `/` is regex.
  if (lastSignificant === '')
    return true
  // After these punctuators / operators, `/` is a regex.
  const regexAfter = '([{,:;!?&|=<>~^+*%-'
  if (regexAfter.includes(lastSignificant))
    return true
  // After an identifier or closing bracket/paren, `/` is division — unless
  // the identifier is a keyword that expects an expression (return, typeof,
  // instanceof, new, delete, void, in, of, yield, await, throw, case).
  if (/[A-Za-z_$]/.test(lastSignificant)) {
    const prefix = effective.slice(0, idx).trimEnd()
    const kwMatch = prefix.match(/(?:^|[^A-Za-z0-9_$])(return|typeof|instanceof|new|delete|void|in|of|yield|await|throw|case)$/)
    if (kwMatch)
      return true
  }
  return false
}
