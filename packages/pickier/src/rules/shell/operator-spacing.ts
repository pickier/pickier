import type { RuleModule } from '../../types'
import { heredocDelimiter, maskShellStrings } from './_shared'

/**
 * Enforce spaces inside test bracket expressions [ ] and [[ ]].
 * Missing spaces cause syntax errors or incorrect behavior.
 *
 * The rule ignores `[` and `]` that appear inside strings (`'...'`, `"..."`,
 * `$'...'`), parameter expansions (`${arr[@]}`, `${arr[0]}`), command
 * substitutions (`$(...)`) and comments, so valid bash such as
 * `${CERTS[@]}` or ANSI-C escapes like `$'\033[0;31m'` are not flagged.
 */
export const operatorSpacingRule: RuleModule = {
  meta: {
    docs: 'Enforce spaces inside [ ] and [[ ]] test expressions',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const delim = heredocDelimiter(line)
      if (delim) {
        inHeredoc = true
        heredocDelim = delim
      }

      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      const masked = maskShellStrings(line)

      for (const issue of findBracketIssues(masked, i + 1, ctx.filePath))
        issues.push(issue)
    }
    return issues
  },
  fix(content) {
    const lines = content.split(/\r?\n/)
    const result: string[] = []
    let inHeredoc = false
    let heredocDelim = ''

    for (const line of lines) {
      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        result.push(line)
        continue
      }
      const delim = heredocDelimiter(line)
      if (delim) {
        inHeredoc = true
        heredocDelim = delim
        result.push(line)
        continue
      }

      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#')) {
        result.push(line)
        continue
      }

      result.push(applyBracketFixes(line))
    }
    return result.join('\n')
  },
}

function findBracketIssues(
  masked: string,
  lineNo: number,
  filePath: string,
): ReturnType<RuleModule['check']> {
  const issues: ReturnType<RuleModule['check']> = []

  // [[ without space after — only when next char is non-space and non-newline
  // and not a closing bracket (for [[]]).
  const reDblOpen = /\[\[(?!\s|\]|$)/g
  for (const m of masked.matchAll(reDblOpen)) {
    issues.push({
      filePath,
      line: lineNo,
      column: (m.index ?? 0) + 1,
      ruleId: 'shell/operator-spacing',
      message: 'Missing space after [[',
      severity: 'warning',
    })
  }

  // ]] without space before
  const reDblClose = /(?<!\s|\[)\]\]/g
  for (const m of masked.matchAll(reDblClose)) {
    issues.push({
      filePath,
      line: lineNo,
      column: (m.index ?? 0) + 1,
      ruleId: 'shell/operator-spacing',
      message: 'Missing space before ]]',
      severity: 'warning',
    })
  }

  // [ in command position without space after. Command position here means
  // either at line start (optionally preceded by whitespace) or preceded by
  // one of: `;`, `|`, `&`, `!`, `(`. We only look at bare `[` — not `[[`.
  for (let j = 0; j < masked.length; j++) {
    if (masked[j] !== '[')
      continue
    if (masked[j + 1] === '[')
      continue // double bracket
    if (j > 0 && masked[j - 1] === '[')
      continue // second char of [[
    if (!isAtCommandPosition(masked, j))
      continue
    const next = masked[j + 1]
    if (next !== undefined && next !== ' ' && next !== '\t') {
      issues.push({
        filePath,
        line: lineNo,
        column: j + 1,
        ruleId: 'shell/operator-spacing',
        message: 'Missing space after [',
        severity: 'warning',
      })
    }
  }

  // ] without space before — only match `]` that terminates a `[ ... ]` test
  // expression. Heuristic: the `]` is followed by whitespace, `;`, `|`, `&`,
  // or end-of-line, and is not immediately preceded or followed by `]`.
  for (let j = 0; j < masked.length; j++) {
    if (masked[j] !== ']')
      continue
    if (masked[j + 1] === ']')
      continue
    if (j > 0 && masked[j - 1] === ']')
      continue
    if (!isTestCloseBracket(masked, j))
      continue
    const prev = masked[j - 1]
    if (prev !== undefined && prev !== ' ' && prev !== '\t') {
      issues.push({
        filePath,
        line: lineNo,
        column: j + 1,
        ruleId: 'shell/operator-spacing',
        message: 'Missing space before ]',
        severity: 'warning',
      })
    }
  }

  return issues
}

function applyBracketFixes(line: string): string {
  const masked = maskShellStrings(line)
  // Collect insertion points against the masked text; apply to original from
  // the right so earlier indices stay valid.
  const inserts: Array<{ pos: number, text: string }> = []

  for (const m of masked.matchAll(/\[\[(?!\s|\]|$)/g)) {
    const pos = (m.index ?? 0) + 2
    inserts.push({ pos, text: ' ' })
  }
  for (const m of masked.matchAll(/(?<!\s|\[)\]\]/g)) {
    const pos = m.index ?? 0
    inserts.push({ pos, text: ' ' })
  }

  for (let j = 0; j < masked.length; j++) {
    if (masked[j] !== '[')
      continue
    if (masked[j + 1] === '[')
      continue
    if (j > 0 && masked[j - 1] === '[')
      continue
    if (!isAtCommandPosition(masked, j))
      continue
    const next = masked[j + 1]
    if (next !== undefined && next !== ' ' && next !== '\t')
      inserts.push({ pos: j + 1, text: ' ' })
  }
  for (let j = 0; j < masked.length; j++) {
    if (masked[j] !== ']')
      continue
    if (masked[j + 1] === ']')
      continue
    if (j > 0 && masked[j - 1] === ']')
      continue
    if (!isTestCloseBracket(masked, j))
      continue
    const prev = masked[j - 1]
    if (prev !== undefined && prev !== ' ' && prev !== '\t')
      inserts.push({ pos: j, text: ' ' })
  }

  if (inserts.length === 0)
    return line

  inserts.sort((a, b) => b.pos - a.pos)
  let fixed = line
  for (const { pos, text } of inserts)
    fixed = `${fixed.slice(0, pos)}${text}${fixed.slice(pos)}`
  return fixed
}

function isAtCommandPosition(masked: string, idx: number): boolean {
  // Scan backward over whitespace.
  let k = idx - 1
  while (k >= 0 && (masked[k] === ' ' || masked[k] === '\t'))
    k--
  if (k < 0)
    return true
  const prev = masked[k]
  if (prev === ';' || prev === '|' || prev === '&' || prev === '!' || prev === '(')
    return true
  // Allow after control keywords like `if`, `while`, `until`, `elif`.
  const textBefore = masked.slice(0, k + 1)
  if (/(?:^|\s)(?:if|while|until|elif|then|else|do)\s*$/.test(textBefore))
    return true
  return false
}

function isTestCloseBracket(masked: string, idx: number): boolean {
  const after = masked[idx + 1]
  if (after === undefined)
    return true
  return (
    after === ' '
    || after === '\t'
    || after === ';'
    || after === '|'
    || after === '&'
    || after === ')'
  )
}
