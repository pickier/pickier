/* eslint-disable regexp/no-super-linear-backtracking */
import type { RuleModule } from '../../types'

function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') depth--
    else if (c === sep && depth === 0) {
      parts.push(s.slice(start, i))
      start = i + 1
    }
  }
  parts.push(s.slice(start))
  return parts
}

function findTopLevelEquals(s: string): number {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '{' || c === '(' || c === '[' || c === '<') depth++
    else if (c === '}' || c === ')' || c === ']' || c === '>') depth--
    else if (c === '=' && depth === 0 && s[i + 1] !== '=' && s[i - 1] !== '!' && s[i - 1] !== '<' && s[i - 1] !== '>') return i
  }
  return -1
}

export const preferConstRule: RuleModule = {
  meta: { docs: 'Suggest \'const\' for variables that are never reassigned (heuristic)' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const decl = line.match(/^\s*(?:let|var)\s+(.+?);?\s*$/)
      if (!decl)
        continue
      let after = decl[1]
      // Strip type annotations (e.g., "x: { a: number, b: string } = ...") to avoid splitting inside types
      // Remove content between : and = at the top level (tracking braces/parens/brackets)
      const eqIdx = findTopLevelEquals(after)
      if (eqIdx >= 0) {
        const colonIdx = after.indexOf(':')
        if (colonIdx >= 0 && colonIdx < eqIdx) {
          after = after.slice(0, colonIdx) + after.slice(eqIdx)
        }
      }
      const parts = splitTopLevel(after, ',')
      for (const partRaw of parts) {
        const part = partRaw.trim()
        if (!part)
          continue
        const simple = part.match(/^([$A-Z_][\w$]*)/i)
        const destruct = part.match(/^[{[]/)
        if (destruct)
          continue
        if (!simple)
          continue
        const name = simple[1]
        const hasInitializer = /=/.test(part)
        if (!hasInitializer)
          continue
        const restStartIdx = text.indexOf(line)
        const rest = text.slice(restStartIdx + line.length)
        // Explicit assignment operator list to avoid fragile character classes
        const assignOps = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '^=', '|=']
        const assignPattern = `\\b${name}\\s*(?:${assignOps.map(op => op.replace(/[|\\^$*+?.(){}[\]]/g, r => `\\${r}`)).join('|')})`
        const assignRe = new RegExp(assignPattern)
        // ++/-- either side of the identifier
        const _incDecRe = new RegExp(`${`(?:\\+\\+|-- )?`.replace(/\s/g, '')}(?:\\b${name}\\b)${`(?: (?:\\+\\+|--))?`.replace(/\s/g, '')}`, 'g')
        const directAssign = assignRe.test(rest)
        const incDecChanged = new RegExp(`(?:^|[^$\w])(?:\\+\\+|--)\\s*${name}\\b|\\b${name}\\s*(?:\\+\\+|--)`).test(rest)
        const changed = directAssign || incDecChanged
        if (!changed) {
          issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'prefer-const', message: `'${name}' is never reassigned. Use 'const' instead`, severity: 'error', help: `Change 'let ${name}' to 'const ${name}' since the variable is never reassigned. This makes your code more predictable and prevents accidental mutations` })
        }
      }
    }
    return issues
  },
}
