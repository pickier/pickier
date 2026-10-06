import type { SourceMap } from '../../ast'
import type { RuleModule } from '../../types'
import { buildSourceMap, findMatching, tokenize } from '../../ast'
import { maskNonCode } from '../../lexer'

// Heuristic port of antfu's `consistent-list-newline` using Pickier's tokenizer.
// Checks object/array literals and named import/export specifier lists: the
// first item sets the style. If it starts on a new line after the opening
// bracket, every item must start on its own line ("wrap"); if it shares the
// bracket's line, no item may start on a new line ("inline"). Line breaks
// inside an item - a nested object, a multi-line call - do not count.

/** Words that start a statement: a `{` holding one is a block, not a list. */
const STATEMENT_START = new Set(['const', 'let', 'var', 'return', 'if', 'for', 'while', 'do', 'switch', 'throw', 'try', 'break', 'continue', 'function', 'class', 'debugger'])

type Token = ReturnType<typeof tokenize>[number]

/** Whether the tokens inside a `{ }` are statements or type members rather than list items. */
function isBlockBody(tokens: Token[]): boolean {
  let depth = 0
  for (const t of tokens) {
    if (t.type !== 'Punct')
      continue
    if (t.value === '(' || t.value === '[' || t.value === '{')
      depth++
    else if ((t.value === ')' || t.value === ']' || t.value === '}') && depth > 0)
      depth--
    else if (t.value === ';' && depth === 0)
      return true
  }
  const [first, second] = tokens
  return first?.type === 'Word' && STATEMENT_START.has(first.value)
    && !(second?.type === 'Punct' && [':', ',', '(', '}', '?'].includes(second.value))
}

function checkDelimited(
  text: string,
  ctxFile: string,
  issues: ReturnType<RuleModule['check']>,
  openIdx: number,
  openChar: string,
  closeChar: string,
  ruleId: string,
  sourceMap: () => SourceMap,
) {
  const close = findMatching(text, openIdx, openChar, closeChar)
  if (close <= openIdx)
    return
  const tokens = tokenize(text.slice(openIdx + 1, close))
  if (openChar === '{' && isBlockBody(tokens))
    return

  // Split on the list's own commas: not those inside a nested bracket, or
  // inside type arguments such as `Map<string, number>`
  const parts: Array<{ start: number, end: number }> = []
  let depth = 0
  let angle = 0
  let start = openIdx + 1
  let prev: Token | undefined
  for (const t of tokens) {
    if (t.type === 'Punct') {
      const v = t.value
      const touchesPrev = prev !== undefined && prev.end === t.start
      if (v === '(' || v === '[' || v === '{') {
        depth++
      }
      else if ((v === ')' || v === ']' || v === '}') && depth > 0) {
        depth--
      }
      else if (v === '<' && touchesPrev && prev!.type === 'Word') {
        angle++
      }
      else if (v === '>' && angle > 0 && !(touchesPrev && prev!.value === '=')) {
        angle--
      }
      else if (v === ',' && depth === 0 && angle === 0) {
        parts.push({ start, end: openIdx + 1 + t.start })
        start = openIdx + 1 + t.end
      }
    }
    prev = t
  }
  parts.push({ start, end: close })

  // Where each item starts and whether a line break comes before it; the
  // part after a trailing comma is empty and not an item
  const items = parts.map(p => ({ p, gap: skipGap(text, p.start, p.end) })).filter(x => x.gap.at < x.p.end)
  if (items.length < 2)
    return
  const wrap = items[0]!.gap.newline
  for (let k = 1; k < items.length; k++) {
    if (items[k]!.gap.newline !== wrap) {
      const loc = sourceMap().indexToLoc(items[k]!.gap.at)
      issues.push({ filePath: ctxFile, line: loc.line, column: loc.column, ruleId, message: wrap ? 'Should have line breaks between items' : 'Should not have line breaks between items', severity: 'warning' })
      return
    }
  }
}

/**
 * Whitespace and comments from `from`, up to `end`: where the next item
 * starts, and whether a line break came before it.
 */
function skipGap(text: string, from: number, end: number): { at: number, newline: boolean } {
  let i = from
  let newline = false
  while (i < end) {
    const c = text[i]
    if (c === '\n') {
      newline = true
      i++
    }
    else if (c === ' ' || c === '\t' || c === '\r') {
      i++
    }
    else if (c === '/' && text[i + 1] === '/') {
      while (i < end && text[i] !== '\n') i++
    }
    else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2)
      i = close === -1 || close + 2 > end ? end : close + 2
    }
    else {
      break
    }
  }
  return { at: i, newline }
}

export const consistentListNewlineRule: RuleModule = {
  meta: { docs: 'Enforce consistent newlines for list-like constructs (objects, arrays, named imports/exports)' },
  check: (source, ctx) => {
    // Comments, strings, template text and regex patterns blanked - same
    // length and line breaks - so a bracket or comma in them is never a list
    const text = maskNonCode(source)
    const issues: ReturnType<RuleModule['check']> = []
    const ruleId = 'style/consistent-list-newline'
    // One line map for the file, built on the first issue
    let map: SourceMap | undefined
    const sourceMap = () => map ??= buildSourceMap(text)
    // An import or export list is reached from its keyword and from its `{`
    const checked = new Set<number>()
    const check = (open: number, openChar: string, closeChar: string) => {
      if (checked.has(open))
        return
      checked.add(open)
      checkDelimited(text, ctx.filePath, issues, open, openChar, closeChar, ruleId, sourceMap)
    }

    // Objects { ... }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '{') {
        // Skip likely control/decl blocks:
        // - If previous non-whitespace char is ')', e.g. `if (...) {` or `try {` after catch(..)
        // - Or if preceding window ends with control/decl keyword (best-effort)
        let k = i - 1
        while (k >= 0 && /[ \t]/.test(text[k])) k--
        if (k >= 0 && text[k] === ')') {
          continue
        }
        // `=> {` is a function body: an arrow returning an object writes `=> ({`
        if (k >= 1 && text[k] === '>' && text[k - 1] === '=')
          continue
        const prev = text.slice(Math.max(0, i - 60), i)
        if (/\b(?:function|class|interface|type|enum|try|catch|finally|if|else|for|while|switch)\b[\s\S]*$/.test(prev))
          continue
        check(i, '{', '}')
      }
      else if (ch === '[') {
        check(i, '[', ']')
      }
      else if (ch === 'i' && text.startsWith('import', i)) {
        // named import: import { a, b } from 'x'
        const open = text.indexOf('{', i)
        if (open > -1)
          check(open, '{', '}')
      }
      else if (ch === 'e' && text.startsWith('export', i)) {
        const open = text.indexOf('{', i)
        if (open > -1)
          check(open, '{', '}')
      }
    }

    return issues
  },
}
