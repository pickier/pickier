import type { LintIssue, RuleContext, RuleModule } from '../../types'

/**
 * Context-aware rule that flags capturing groups in regex literals
 * only when the captured values are not used.
 *
 * Captures are considered "used" when:
 * - The regex has backreferences (\1, \2, etc.)
 * - The regex result is accessed via .match(), .exec(), .matchAll()
 * - The regex is used in .replace() with $1/$2 references or a function callback
 * - The regex is assigned to a variable that is later used with .exec()
 *
 * Captures are considered "unused" when:
 * - Used only in .test() or .search()
 * - Not assigned or used in a context that accesses match groups
 */

interface RegexInfo {
  patternStart: number // index of opening /
  patternEnd: number // index past flags
  pattern: string
  capCount: number
  firstCapOffset: number // offset of first ( in pattern
}

function parseRegexLiteral(content: string, idx: number): RegexInfo | null {
  // Check if this could be a regex literal (not division)
  let prevIdx = idx - 1
  while (prevIdx >= 0 && (content[prevIdx] === ' ' || content[prevIdx] === '\t')) prevIdx--
  const prevChar = prevIdx >= 0 ? content[prevIdx] : ''
  const regexPrecedes = '=(<>!&|?:;,{[+(~^%*/'
  const isRegex = prevIdx < 0
    || regexPrecedes.includes(prevChar)
    || /\b(?:return|typeof|void|delete|throw|new|in|of|case)\s*$/.test(content.slice(Math.max(0, prevIdx - 5), prevIdx + 1))

  if (!isRegex) return null

  // Parse the regex pattern
  let i = idx + 1
  let inClass = false
  let escaped = false
  let closedAt = -1
  while (i < content.length) {
    const c = content[i]
    if (escaped) { escaped = false }
    else if (c === '\\') { escaped = true }
    else if (c === '[') { if (!inClass) inClass = true }
    else if (c === ']') { if (inClass) inClass = false }
    else if (c === '/' && !inClass) { closedAt = i; break }
    else if (c === '\n') { break }
    i++
  }

  if (closedAt <= idx) return null

  const pattern = content.slice(idx + 1, closedAt)

  // Skip flags
  let flagEnd = closedAt + 1
  while (flagEnd < content.length && /[gimsuy]/.test(content[flagEnd])) flagEnd++

  // Skip if backreferences present
  if (/\\[1-9]/.test(pattern)) return null

  // Count capturing groups (skip character classes)
  let capCount = 0
  let firstCapOffset = -1
  let inCharClass = false
  for (let j = 0; j < pattern.length; j++) {
    if (pattern[j] === '\\') { j++; continue }
    if (pattern[j] === '[' && !inCharClass) { inCharClass = true; continue }
    if (pattern[j] === ']' && inCharClass) { inCharClass = false; continue }
    if (inCharClass) continue
    if (pattern[j] === '('
      && pattern.slice(j + 1, j + 3) !== '?:'
      && pattern.slice(j + 1, j + 3) !== '?='
      && pattern.slice(j + 1, j + 3) !== '?!'
      && pattern.slice(j + 1, j + 4) !== '?<='
      && pattern.slice(j + 1, j + 4) !== '?<!') {
      if (firstCapOffset < 0) firstCapOffset = j
      capCount++
    }
  }

  if (capCount === 0) return null

  return { patternStart: idx, patternEnd: flagEnd, pattern, capCount, firstCapOffset }
}

/**
 * Determine if capturing groups are used in the surrounding context.
 * Returns true if captures appear to be used (should NOT flag).
 */
function areCapturesUsed(content: string, regexStart: number, regexEnd: number): boolean {
  // Look at what comes after the regex: .test(), .exec(), etc.
  let afterIdx = regexEnd
  while (afterIdx < content.length && (content[afterIdx] === ' ' || content[afterIdx] === '\t')) afterIdx++

  // Check for method call on the regex: /pattern/.exec(str)
  if (content[afterIdx] === '.') {
    const rest = content.slice(afterIdx + 1, afterIdx + 20)
    // .test() - captures are NOT used
    if (/^test\s*\(/.test(rest)) return false
    // .exec() - captures ARE used
    if (/^exec\s*\(/.test(rest)) return true
  }

  // Look backwards to see what precedes the regex
  let beforeIdx = regexStart - 1
  while (beforeIdx >= 0 && (content[beforeIdx] === ' ' || content[beforeIdx] === '\t')) beforeIdx--

  // Check for string method calls: str.match(/regex/), str.matchAll(/regex/), str.replace(/regex/, ...)
  // Look for .match( or .matchAll( or .replace( or .replaceAll( or .search( or .split(
  if (content[beforeIdx] === '(') {
    // Find the method name before the (
    const methodEnd = beforeIdx
    let methodStart = methodEnd - 1
    while (methodStart >= 0 && (content[methodStart] === ' ' || content[methodStart] === '\t')) methodStart--
    // Now methodStart should point to the end of the method name
    const slice = content.slice(Math.max(0, methodStart - 20), methodStart + 1)

    if (/\.match\s*$/.test(slice)) return true
    if (/\.matchAll\s*$/.test(slice)) return true
    if (/\.exec\s*$/.test(slice)) return true
    if (/\.replace\s*$/.test(slice)) return true
    if (/\.replaceAll\s*$/.test(slice)) return true
    if (/\.split\s*$/.test(slice)) return true
    if (/\.search\s*$/.test(slice)) return false
    if (/\.test\s*$/.test(slice)) return false
  }

  // Check if the regex is assigned to a variable: const re = /pattern/
  // Then check if that variable is used with .exec() or passed to .match()
  const lineStart = content.lastIndexOf('\n', regexStart) + 1
  const beforeRegex = content.slice(lineStart, regexStart).trim()
  const assignMatch = beforeRegex.match(/(?:const|let|var)\s+(\w+)\s*=\s*$/)
  if (assignMatch) {
    const varName = assignMatch[1]
    // Search forward in the content for uses of this variable
    const afterContent = content.slice(regexEnd)
    // Check for varName.exec( or varName.test(
    const execPattern = new RegExp(`\\b${varName}\\.exec\\s*\\(`)
    const testPattern = new RegExp(`\\b${varName}\\.test\\s*\\(`)
    const matchPattern = new RegExp(`\\.match(?:All)?\\s*\\(\\s*${varName}\\s*\\)`)
    const replacePattern = new RegExp(`\\.replace(?:All)?\\s*\\(\\s*${varName}`)

    const hasExec = execPattern.test(afterContent)
    const hasMatch = matchPattern.test(afterContent)
    const hasReplace = replacePattern.test(afterContent)
    const hasTest = testPattern.test(afterContent)

    // If used with exec/match/replace, captures are used
    if (hasExec || hasMatch || hasReplace) return true
    // If ONLY used with test, captures are not used
    if (hasTest) return false
    // If we can't determine usage, be conservative and skip
    return true
  }

  // For other contexts (e.g., passed as argument, used in condition), be conservative
  // and assume captures might be used
  return true
}

/**
 * Skip past a regex literal starting at idx, even if it has no capturing groups.
 * Returns the position after the regex (past flags), or idx+1 if not a regex.
 */
function skipRegexLiteral(content: string, idx: number): number {
  // Check regex context
  let prevIdx = idx - 1
  while (prevIdx >= 0 && (content[prevIdx] === ' ' || content[prevIdx] === '\t')) prevIdx--
  const prevChar = prevIdx >= 0 ? content[prevIdx] : ''
  const regexPrecedes = '=(<>!&|?:;,{[+(~^%*/'
  const isRegex = prevIdx < 0
    || regexPrecedes.includes(prevChar)
    || /\b(?:return|typeof|void|delete|throw|new|in|of|case)\s*$/.test(content.slice(Math.max(0, prevIdx - 5), prevIdx + 1))
  if (!isRegex) return idx + 1

  let i = idx + 1
  let inClass = false
  let escaped = false
  while (i < content.length) {
    const c = content[i]
    if (escaped) { escaped = false }
    else if (c === '\\') { escaped = true }
    else if (c === '[') { if (!inClass) inClass = true }
    else if (c === ']') { if (inClass) inClass = false }
    else if (c === '/' && !inClass) {
      i++
      while (i < content.length && /[gimsuy]/.test(content[i])) i++
      return i
    }
    else if (c === '\n') { break }
    i++
  }
  return idx + 1
}

function findIssues(content: string, ctx: RuleContext): LintIssue[] {
  const issues: LintIssue[] = []
  const filePath = ctx.filePath

  let idx = 0

  while (idx < content.length) {
    const ch = content[idx]

    // Skip single-line comments
    if (ch === '/' && content[idx + 1] === '/') {
      while (idx < content.length && content[idx] !== '\n') idx++
      continue
    }

    // Skip multi-line comments
    if (ch === '/' && content[idx + 1] === '*') {
      idx += 2
      while (idx < content.length - 1 && !(content[idx] === '*' && content[idx + 1] === '/')) idx++
      idx += 2
      continue
    }

    // Skip string literals
    if (ch === '\'' || ch === '"' || ch === '`') {
      const quote = ch
      idx++
      while (idx < content.length) {
        if (content[idx] === '\\') { idx += 2; continue }
        if (content[idx] === quote) { idx++; break }
        idx++
      }
      continue
    }

    if (ch === '/') {
      const info = parseRegexLiteral(content, idx)
      if (!info) {
        // Even if parseRegexLiteral returns null, we may need to skip past a valid regex
        // that just had no capturing groups or had backreferences. Re-scan to find the end.
        const skipEnd = skipRegexLiteral(content, idx)
        if (skipEnd > idx + 1) {
          idx = skipEnd
        } else {
          idx++
        }
        continue
      }

      // Check if captures are actually used in context
      if (!areCapturesUsed(content, info.patternStart, info.patternEnd)) {
        const reportPos = info.patternStart + 1 + (info.firstCapOffset >= 0 ? info.firstCapOffset : 0)
        const prefix = content.slice(0, reportPos)
        const line = (prefix.match(/\r?\n/g) || []).length + 1
        const col = reportPos - (prefix.lastIndexOf('\n') + 1) + 1
        issues.push({
          filePath,
          line,
          column: col,
          ruleId: 'regexp/no-unused-capturing-group',
          message: 'Unused capturing group in regular expression; use non-capturing group (?:...) instead',
          severity: 'error',
        })
      }

      idx = info.patternEnd
      continue
    }
    idx++
  }

  return issues
}

export const noUnusedCapturingGroupRule: RuleModule = {
  meta: {
    docs: 'Flags regex literals with unused capturing groups (context-aware)',
    recommended: false,
  },
  check(content, ctx) {
    return findIssues(content, ctx)
  },
}
