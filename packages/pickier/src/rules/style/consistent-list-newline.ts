import type { SourceMap } from '../../ast'
import type { RuleModule } from '../../types'
import { buildSourceMap, findMatching, tokenize } from '../../ast'

// Heuristic port of src-2 `consistent-list-newline` using Pickier's tokenizer.
// Checks object/array literals and named import/export specifier lists.
// - If contents span multiple lines, require each comma-separated item to begin on its own line ("wrap").
// - If contents are single-line, require no newlines inside ("inline").

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
  const inner = text.slice(openIdx + 1, close)
  const hasNewline = /\r?\n/.test(inner)

  // Split on top-level commas inside the braces/brackets
  const parts: Array<{ start: number, end: number }> = []
  let depth = 0
  let start = openIdx + 1
  const tokens = tokenize(text.slice(openIdx + 1, close))
  let _rel = 0
  for (const t of tokens) {
    const s = openIdx + 1 + t.start
    const e = openIdx + 1 + t.end
    _rel = e
    if (t.type === 'Punct') {
      if (t.value === openChar) {
        depth++
      }
      else if (t.value === closeChar && depth > 0) {
        depth--
      }
      else if (t.value === ',' && depth === 0) {
        parts.push({ start, end: s })
        start = e
      }
    }
  }
  parts.push({ start, end: close })

  if (!hasNewline) {
    // Inline expected: if any newline in inner, flag
    for (const p of parts) {
      const slice = text.slice(p.start, p.end)
      if (/\r?\n/.test(slice)) {
        const loc = sourceMap().indexToLoc(p.start)
        issues.push({ filePath: ctxFile, line: loc.line, column: loc.column, ruleId, message: 'Should not have line breaks between items', severity: 'warning' })
        break
      }
    }
    return
  }

  // Multi-line expected: each item should start on its own line (ignoring whitespace)
  // Special-case: if we see multiple commas before the first newline, it's definitely a violation
  const firstNl = inner.indexOf('\n')
  if (firstNl > 0) {
    const beforeFirstNl = inner.slice(0, firstNl)
    const commas = (beforeFirstNl.match(/,/g) || []).length
    const afterFirstNl = inner.slice(firstNl + 1)
    const moreNewlines = afterFirstNl.includes('\n')
    const afterHasComma = afterFirstNl.includes(',')
    // If most items are already inline before the first newline and the tail has no further newline
    // (i.e., only one leftover item), prefer "no line breaks" suggestion
    if (commas >= 1 && /\S,\s*\S/.test(beforeFirstNl) && !moreNewlines && !afterHasComma) {
      const loc = sourceMap().indexToLoc(openIdx + 1 + firstNl + 1)
      issues.push({ filePath: ctxFile, line: loc.line, column: loc.column, ruleId, message: 'Should not have line breaks between items', severity: 'warning' })
      return
    }
    else if (commas >= 1 && /\S,\s*\S/.test(beforeFirstNl)) {
      const loc = sourceMap().indexToLoc(openIdx + 1 + beforeFirstNl.search(/,\s*\S/))
      issues.push({ filePath: ctxFile, line: loc.line, column: loc.column, ruleId, message: 'Should have line breaks between items', severity: 'warning' })
      return
    }
  }

  // Each item must follow a newline (and indentation), unless only
  // whitespace comes before it. Scanning back from each item and comparing
  // with the first non-whitespace character keeps a long list linear.
  const firstContent = inner.search(/\S/)
  const contentFrom = firstContent === -1 ? Infinity : openIdx + 1 + firstContent
  for (const p of parts) {
    let j = p.start
    while (j > openIdx + 1 && (text[j - 1] === ' ' || text[j - 1] === '\t')) j--
    const afterNewline = j > openIdx + 1 && text[j - 1] === '\n'
    if (!afterNewline && contentFrom < p.start) {
      const loc = sourceMap().indexToLoc(p.start)
      issues.push({ filePath: ctxFile, line: loc.line, column: loc.column, ruleId, message: 'Should have line breaks between items', severity: 'warning' })
      break
    }
  }
}

export const consistentListNewlineRule: RuleModule = {
  meta: { docs: 'Enforce consistent newlines for list-like constructs (objects, arrays, named imports/exports)' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const ruleId = 'style/consistent-list-newline'
    // One line map for the file, built on the first issue
    let map: SourceMap | undefined
    const sourceMap = () => map ??= buildSourceMap(text)

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
        const prev = text.slice(Math.max(0, i - 60), i)
        if (/\b(?:function|class|interface|type|enum|try|catch|finally|if|else|for|while|switch)\b[\s\S]*$/.test(prev))
          continue
        checkDelimited(text, ctx.filePath, issues, i, '{', '}', ruleId, sourceMap)
      }
      else if (ch === '[') {
        checkDelimited(text, ctx.filePath, issues, i, '[', ']', ruleId, sourceMap)
      }
      else if (ch === 'i' && text.startsWith('import', i)) {
        // named import: import { a, b } from 'x'
        const open = text.indexOf('{', i)
        if (open > -1)
          checkDelimited(text, ctx.filePath, issues, open, '{', '}', ruleId, sourceMap)
      }
      else if (ch === 'e' && text.startsWith('export', i)) {
        const open = text.indexOf('{', i)
        if (open > -1)
          checkDelimited(text, ctx.filePath, issues, open, '{', '}', ruleId, sourceMap)
      }
    }

    return issues
  },
}
