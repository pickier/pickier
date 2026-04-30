/* eslint-disable regexp/no-super-linear-backtracking */
import type { RuleModule } from '../../types'
import { computeLineStartsInTemplate } from './_template-tracking'

function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let inStr: 'single' | 'double' | 'template' | null = null
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (c === '\\' && inStr) {
      escaped = true
      continue
    }
    if (!inStr) {
      if (c === '\'') inStr = 'single'
      else if (c === '"') inStr = 'double'
      else if (c === '`') inStr = 'template'
      else if (c === '(' || c === '{' || c === '[') depth++
      else if (c === ')' || c === '}' || c === ']') depth--
      else if (c === sep && depth === 0) {
        parts.push(s.slice(start, i))
        start = i + 1
      }
    }
else {
      if ((inStr === 'single' && c === '\'') || (inStr === 'double' && c === '"') || (inStr === 'template' && c === '`')) inStr = null
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

// Returns the names of variables declared on the line, paired with whether
// each is "fixable" (initialized AND never reassigned in the rest of the
// text). Returns null if the line isn't a let/var declaration we understand.
function analyzeLetDecl(line: string, text: string): Array<{ name: string, fixable: boolean }> | null {
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const declRe = new RegExp('^\\s*(?:let|var)\\s+(.+?)' + ';' + '?\\s*$')
  const decl = line.match(declRe)
  if (!decl)
    return null
  let after = decl[1]
  const eqIdx = findTopLevelEquals(after)
  if (eqIdx >= 0) {
    const colonIdx = after.indexOf(':')
    if (colonIdx >= 0 && colonIdx < eqIdx) {
      after = after.slice(0, colonIdx) + after.slice(eqIdx)
    }
  }
  const parts = splitTopLevel(after, ',')
  const result: Array<{ name: string, fixable: boolean }> = []
  for (const partRaw of parts) {
    const part = partRaw.trim()
    if (!part)
      continue
    const destruct = part.match(/^[{[]/)
    if (destruct) {
      // Destructuring patterns: too risky to fix in place; mark unfixable
      // so the whole-line fixer won't rewrite the keyword.
      return null
    }
    const simple = part.match(/^([$A-Z_][\w$]*)/i)
    if (!simple)
      return null
    const name = simple[1]
    const hasInitializer = /=/.test(part)
    if (!hasInitializer) {
      // No initializer — the line can't be turned into `const`.
      return null
    }
    const restStartIdx = text.indexOf(line)
    const rest = text.slice(restStartIdx + line.length)
    const assignOps = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '^=', '|=']
    const assignPattern = `\\b${name}\\s*(?:${assignOps.map(op => op.replace(/[|\\^$*+?.(){}[\]]/g, r => `\\${r}`)).join('|')})`
    const directAssign = new RegExp(assignPattern).test(rest)
    // eslint-disable-next-line no-useless-escape
    const incDecChanged = new RegExp(`(?:^|[^$\w])(?:\\+\\+|--)\\s*${name}\\b|\\b${name}\\s*(?:\\+\\+|--)`).test(rest)
    result.push({ name, fixable: !directAssign && !incDecChanged })
  }
  return result
}

export const preferConstRule: RuleModule = {
  meta: { docs: 'Suggest \'const\' for variables that are never reassigned (heuristic)' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)
    // Skip declarations inside template-literal bodies — they're embedded
    // code (e.g. an injected <script> blob), not real top-level TS that
    // a `let → const` rewrite can reason about safely.
    const inTemplate = computeLineStartsInTemplate(text)
    for (let i = 0; i < lines.length; i++) {
      if (inTemplate[i])
        continue
      const line = lines[i]
      const decls = analyzeLetDecl(line, text)
      if (!decls)
        continue
      for (const { name, fixable } of decls) {
        if (!fixable)
          continue
        issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'prefer-const', message: `'${name}' is never reassigned. Use 'const' instead`, severity: 'error', help: `Change 'let ${name}' to 'const ${name}' since the variable is never reassigned. This makes your code more predictable and prevents accidental mutations` })
      }
    }
    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Only auto-fix `let` declarations, not `var`.
      //
      // Real TS code in a Pickier-formatted project uses `let`/`const`, so
      // limiting the fix to `let` covers the cases that matter. `var` is
      // typically only seen in legacy code or — and this is the load-
      // bearing case — inside template literals that emit JavaScript at
      // runtime (e.g. injected <script> blobs). Rewriting those to
      // `const` would change the emitted code's keyword, which is a
      // semantic change we shouldn't make without proper template-
      // literal awareness. The check still flags `var` so users can fix
      // by hand.
      if (!/^\s*let\b/.test(line))
        continue
      const decls = analyzeLetDecl(line, text)
      if (!decls || decls.length === 0)
        continue
      // Only rewrite the keyword if EVERY declared variable on this line is
      // safe to make const. A mixed line (one fixable, one reassigned later)
      // can't become const without splitting the declaration, which we
      // don't attempt here.
      if (!decls.every(d => d.fixable))
        continue
      const replaced = line.replace(/^(\s*)let(\s+)/, '$1const$2')
      if (replaced !== line) {
        lines[i] = replaced
        changed = true
      }
    }
    return changed ? lines.join('\n') : text
  },
}
