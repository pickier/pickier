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

/**
 * Walk `text` looking for destructuring-pattern assignments — `[…] = …`
 * or `{…} = …` — and return true when `name` appears as a binding
 * inside any of them. This catches the `let x; [x, y] = fn()` pattern
 * (issue #1357) that the simple `\bname\b\s*=` heuristic misses
 * because in destructuring `name` is followed by `,`, `]`, or `}`.
 *
 * Conservative: walks bracket pairs by counting depth, ignores string
 * literals so an `[x, y] = …` written inside a template literal body
 * doesn't generate false matches against an unrelated outer binding.
 */
function destructuringReassignsName(text: string, name: string): boolean {
  const re = new RegExp(`\\b${name}\\b`)
  let i = 0
  let inStr: 'single' | 'double' | 'template' | null = null
  let escaped = false
  while (i < text.length) {
    const c = text[i]
    if (escaped) { escaped = false; i++; continue }
    if (c === '\\' && inStr) { escaped = true; i++; continue }
    if (inStr) {
      if ((inStr === 'single' && c === '\'')
        || (inStr === 'double' && c === '"')
        || (inStr === 'template' && c === '`'))
        inStr = null
      i++
      continue
    }
    if (c === '\'') { inStr = 'single'; i++; continue }
    if (c === '"') { inStr = 'double'; i++; continue }
    if (c === '`') { inStr = 'template'; i++; continue }
    if (c === '[' || c === '{') {
      const open = c
      const close = c === '[' ? ']' : '}'
      let depth = 1
      let j = i + 1
      while (j < text.length && depth > 0) {
        const cj = text[j]
        if (cj === '\\') { j += 2; continue }
        if (cj === open) depth++
        else if (cj === close) depth--
        if (depth === 0) break
        j++
      }
      if (depth === 0 && j < text.length) {
        // Look past whitespace for `=` (and not `==` / `=>`).
        let k = j + 1
        while (k < text.length && (text[k] === ' ' || text[k] === '\t' || text[k] === '\r' || text[k] === '\n'))
          k++
        if (text[k] === '=' && text[k + 1] !== '=' && text[k + 1] !== '>') {
          // The bracket span [i+1 .. j-1] is a destructuring pattern.
          const inside = text.slice(i + 1, j)
          if (re.test(inside)) {
            // Make sure it's a binding position, not an object-literal
            // shorthand value or a `key: value` where `value` is the
            // binding. For `{ key: name }` only `name` is the binding;
            // for `{ name }` (shorthand) the same `name` is both. The
            // heuristic: if `name` appears immediately after `:` (with
            // optional whitespace), it's the binding. If `name` appears
            // before `:`, it's the property key (NOT the binding).
            // We only need to refute the second case.
            const keyOnly = new RegExp(`\\b${name}\\b\\s*:`)
            const valueAfterColon = new RegExp(`:\\s*\\b${name}\\b`)
            if (open === '{') {
              // For object destructuring: name is binding UNLESS it appears
              // ONLY as `name:` (key) and never as shorthand or `: name`.
              const isKeyOnly = keyOnly.test(inside) && !valueAfterColon.test(inside)
                && !new RegExp(`(?:^|[\\s,{])\\s*${name}\\s*(?:,|\\s*=|\\s*})`).test(inside)
              if (!isKeyOnly)
                return true
            }
            else {
              // Array destructuring: any occurrence is a binding position.
              return true
            }
          }
        }
      }
      i = j + 1
      continue
    }
    i++
  }
  return false
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
    // Destructuring reassignment: `[x, y] = …` or `{ x, y } = …` later
    // in the file (issue #1357). The simple `\bname\s*=` regex above
    // misses these because in destructuring `name` is followed by `,`,
    // `]`, or `}`, not `=`.
    const destructReassigned = destructuringReassignsName(rest, name)
    result.push({ name, fixable: !directAssign && !incDecChanged && !destructReassigned })
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

    // Pre-compute which lines are suppressed by an
    // `// eslint-disable-next-line prefer-const` /
    // `// pickier-disable-next-line prefer-const` directive on the line
    // above. The linter applies this filter at the issue-collection
    // layer when reporting, but the fix path bypasses that — so we
    // mirror the same logic here. Issue #1357.
    const disabledLines = new Set<number>()
    const disableNextRe = /(?:eslint|pickier)-disable-next-line\b([^*\n]*)/
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(disableNextRe)
      if (!m)
        continue
      const ruleList = m[1].trim()
      // Empty list disables all rules for the next line.
      if (ruleList === '' || /\bprefer-const\b/.test(ruleList))
        disabledLines.add(i + 2) // 1-indexed line directly below
    }

    let changed = false
    for (let i = 0; i < lines.length; i++) {
      // Skip if a disable-next-line directive points at this line
      // (1-indexed, so i+1).
      if (disabledLines.has(i + 1))
        continue
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
