import { lexSource } from './lexer'

// Lightweight parsing utilities (no deps). Intentionally minimal for Pickier rules.
// Provides tokenization, simple bracket matching, and loc <-> index mapping.

export interface Loc { line: number, column: number }
export interface Range { start: number, end: number }
export interface Token { type: string, value: string, start: number, end: number }

export interface SourceMap {
  // 0-based UTF-16 line offsets
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

// Structural tokens share the lexical regions used by the rule scanners.
// Opaque templates and regexes retain their complete source span.
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const push = (type: string, start: number, end: number): void => {
    tokens.push({ type, value: text.slice(start, end), start, end })
  }
  const lexed = lexSource(text)
  const wordCharRe = new RegExp('[^\\s(){}[\\]' + ';' + ':,.<>+\\-*%&|^!?=~\'"`/]')
  let regionIndex = 0
  let templateIndex = 0
  let i = 0
  const n = text.length
  while (i < n) {
    while (templateIndex < lexed.templates.length && lexed.templates[templateIndex][1] < i)
      templateIndex++
    const template = lexed.templates[templateIndex]
    if (template?.[0] === i) {
      const end = Math.min(n, template[1] + 1)
      push('Template', i, end)
      i = end
      templateIndex++
      continue
    }
    while (regionIndex < lexed.regions.length && lexed.regions[regionIndex].end <= i)
      regionIndex++
    const region = lexed.regions[regionIndex]
    if (region && region.kind !== 'template' && region.start - (region.kind === 'comment' ? 2 : 1) === i) {
      let end = region.end
      let type: string
      if (region.kind === 'comment') {
        const block = text[i + 1] === '*'
        type = block ? 'BlockComment' : 'LineComment'
        if (block && text.slice(end, end + 2) === '*/')
          end += 2
      }
      else if (region.kind === 'string') {
        type = 'String'
        if (text[end] === text[i])
          end++
      }
      else {
        type = 'Regex'
        end = Math.min(n, end + 1)
        while (end < n && /[a-z]/i.test(text[end])) end++
      }
      push(type, i, end)
      i = end
      regionIndex++
      continue
    }
    const c = text[i]
    if (c <= ' ' || /\s/.test(c)) {
      i++
      continue
    }
    if ('(){}[];:,.<>+-*%&|^!?=~/'.includes(c)) {
      push('Punct', i, i + 1)
      i++
      continue
    }
    const start = i
    while (i < n && wordCharRe.test(text[i])) i++
    if (i === start)
      i++
    push('Word', start, i)
  }
  return tokens
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
