// Lightweight parsing utilities (no deps). Intentionally minimal for Pickier rules.
// Provides tokenization, simple bracket matching, and loc <-> index mapping.

export interface Loc { line: number, column: number }
export interface Range { start: number, end: number }
export interface Token { type: string, value: string, start: number, end: number }

export interface SourceMap {
  // 0-based line starts byte offsets
  lineStarts: number[]
  indexToLoc: (idx: number) => Loc
}

export function buildSourceMap(text: string): SourceMap {
  const lineStarts: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n')
      lineStarts.push(i + 1)
  }
  function indexToLoc(idx: number): Loc {
    // binary search for line
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const start = lineStarts[mid]
      const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Infinity
      if (idx < start)
        hi = mid - 1
      else if (idx >= next)
        lo = mid + 1
      else return { line: mid + 1, column: idx - start + 1 }
    }
    // fallback
    const last = lineStarts[lineStarts.length - 1]
    return { line: lineStarts.length, column: Math.max(1, idx - last + 1) }
  }
  return { lineStarts, indexToLoc }
}

// Very small tokenizer sufficient for structural tasks. Tracks strings, template, regex, comments.
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const push = (type: string, s: number, e: number) => tokens.push({ type, value: text.slice(s, e), start: s, end: e })
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    // whitespace
    if (c <= ' ') {
      i++
      continue
    }
    // line comment
    if (c === '/' && text[i + 1] === '/') {
      const s = i
      i += 2
      while (i < n && text[i] !== '\n') i++
      push('LineComment', s, i)
      continue
    }
    // block comment
    if (c === '/' && text[i + 1] === '*') {
      const s = i
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++
      i = Math.min(n, i + 2)
      push('BlockComment', s, i)
      continue
    }
    // string
    if (c === '"' || c === '\'') {
      const q = c
      const s = i
      i++
      while (i < n) {
        const ch = text[i]
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === q) {
          i++
          break
        }
        i++
      }
      push('String', s, i)
      continue
    }
    // template
    if (c === '`') {
      const s = i
      i++
      let depth = 0
      while (i < n) {
        const ch = text[i]
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === '`' && depth === 0) {
          i++
          break
        }
        if (ch === '$' && text[i + 1] === '{') {
          depth++
          i += 2
          continue
        }
        if (ch === '}' && depth > 0) {
          depth--
          i++
          continue
        }
        i++
      }
      push('Template', s, i)
      continue
    }
    // slash handling: comments, regex, or division punctuator
    if (c === '/') {
      // handled comments above? we are before comment checks, so do them first
      if (text[i + 1] === '/') {
        const s = i
        i += 2
        while (i < n && text[i] !== '\n') i++
        push('LineComment', s, i)
        continue
      }
      if (text[i + 1] === '*') {
        const s = i
        i += 2
        while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++
        i = Math.min(n, i + 2)
        push('BlockComment', s, i)
        continue
      }
      if (isRegexPossible(tokens)) {
        const s = i
        i++
        while (i < n) {
          const ch = text[i]
          if (ch === '\\') {
            i += 2
            continue
          }
          if (ch === '/') {
            i++
            break
          }
          i++
        }
        // flags
        while (i < n && /[a-z]/i.test(text[i])) i++
        push('Regex', s, i)
        continue
      }
      // otherwise treat as division operator punctuator
      push('Punct', i, i + 1)
      i++
      continue
    }
    // punctuators (excluding '/') which is handled above
    if ('(){}[];:,.<>+-*%&|^!?=~'.includes(c)) {
      push('Punct', i, i + 1)
      i++
      continue
    }
    // identifier/number
    const s = i
    const wordCharRe = new RegExp('[^\\s(){}[\\]' + ';' + ':,.<>+\\-*%&|^!?=~\'"`/]')
    while (i < n && wordCharRe.test(text[i])) {
      i++
    }
    if (i > s) {
      push('Word', s, i)
    }
    else {
      // fallback: consume one char to avoid infinite loop
      push('Word', i, i + 1)
      i++
    }
  }
  return tokens
}

function isRegexPossible(tokens: Token[]): boolean {
  if (tokens.length === 0)
    return true
  const t = tokens[tokens.length - 1]
  // after these token types, a regex can appear
  const punctRe = new RegExp('[(!,{' + ';' + ':?=]')
  return (
    (t.type === 'Punct' && punctRe.test(t.value))
    || (t.type === 'Word' && /^(?:return|throw|case|of|in|instanceof|typeof|void|new)$/.test(t.value))
  )
}

export function findMatching(text: string, start: number, open: string, close: string): number {
  let depth = 0

  // helpers
  const isWhitespace = (c: string) => c <= ' '
  const skipLineComment = (i: number) => {
    while (i < text.length && text[i] !== '\n') i++
    return i
  }
  const skipBlockComment = (i: number) => {
    i += 2 // skip '/*'
    while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
    return Math.min(text.length, i + 2)
  }
  const skipString = (i: number, quote: '"' | '\'' | '`') => {
    const n = text.length
    if (quote === '`') {
      // Template with ${} tracking and inner string/comment skipping
      i++
      let tplDepth = 0
      while (i < n) {
        const ch = text[i]
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === '`' && tplDepth === 0) {
          i++
          break
        }
        if (ch === '$' && text[i + 1] === '{') {
          tplDepth++
          i += 2
          continue
        }
        if (ch === '}' && tplDepth > 0) {
          tplDepth--
          i++
          continue
        }
        if (ch === '"' || ch === '\'') {
          i = skipString(i, ch as '"' | '\'')
          continue
        }
        if (ch === '/' && text[i + 1] === '/') {
          i = skipLineComment(i + 2)
          continue
        }
        if (ch === '/' && text[i + 1] === '*') {
          i = skipBlockComment(i)
          continue
        }
        i++
      }
      return i
    }
    // Normal string
    i++
    while (i < n) {
      const ch = text[i]
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === quote) {
        i++
        break
      }
      i++
    }
    return i
  }
  const isRegexStart = (i: number) => {
    // Heuristic: previous non-space char suggests division vs regex
    let j = i - 1
    while (j >= 0 && isWhitespace(text[j])) {
      j--
    }
    const prev = j >= 0 ? text[j] : ''
    // After these, a regex can start
    const regexStartRe = new RegExp('[(:[{' + ';' + '?,=!&|^~+\\-*%<>]')
    if (regexStartRe.test(prev))
      return true
    // Start of input
    if (prev === '')
      return true
    return false
  }
  const skipRegex = (i: number) => {
    // i points at '/'
    i++
    const n = text.length
    while (i < n) {
      const ch = text[i]
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '/') {
        i++
        break
      }
      i++
    }
    // flags
    while (i < n && /[a-z]/i.test(text[i])) i++
    return i
  }

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === open) {
      depth++
      continue
    }
    if (ch === close) {
      depth--
      if (depth === 0)
        return i
      continue
    }
    // Skip literals and comments to avoid false brace hits and performance issues
    if (ch === '"' || ch === '\'' || ch === '`') {
      i = skipString(i, ch as '"' | '\'' | '`') - 1
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(i + 2) - 1
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(i) - 1
      continue
    }
    if (ch === '/' && isRegexStart(i)) {
      i = skipRegex(i) - 1
      continue
    }
  }
  return -1
}
