import type { PickierConfig } from './types'

const CODE_EXTS = new Set(['.ts', '.js'])
const JSON_EXTS = new Set(['.json', '.jsonc'])
const YAML_EXTS = new Set(['.yaml', '.yml'])
const SHELL_EXTS = new Set(['.sh', '.bash', '.zsh', '.ksh', '.dash'])
const SHELL_SHEBANG_RE = /^#!\s*(?:\/usr\/bin\/env\s+)?(?:ba|z|k|da)?sh\b/

// Pre-compiled regex patterns for the hot loop (avoids re-creation per line)
const _RE_LEADING_WS = /^[ \t]*/
// Indent tracking counts braces, brackets AND parens — tracking only `{`
// flattened multi-line arrays and call arguments to the enclosing level
const RE_CLOSING_BRACE = /^[}\])]/
const RE_OPENING_BRACE = /[{[(]\s*$/
const RE_TRAILING_LINE_COMMENT = /\s*\/\/.*$/
const RE_CONTROL_OPEN = /^(?:if|else\s+if|for|while)\s*\(/
// `.method()` chain links, ternary branches, and logical-operator operands
// that start a line continue the previous statement. `?.` is optional
// chaining; a lone `:` could be a case label so require a space after it.
const RE_CONTINUATION_LINE = /^(?:\.[\w$[]|\?[\s.:]|:\s|&&|\|\|)/

/**
 * Brace-less control-flow line whose single statement hangs one level deeper:
 * `if (x)` / `else if (x)` / `for (...)` / `while (...)` where the line ends
 * exactly at the `)` closing the condition, or a bare `else` / `do`. A
 * single-line `if (x) stmt()` is NOT hanging — the line also ends with `)`,
 * so the closing paren of the condition must be matched, not pattern-matched.
 */
function isHangingControlLine(code: string): boolean {
  const m = RE_CONTROL_OPEN.exec(code)
  if (!m)
    return /^(?:else|do)\s*$/.test(code)
  let depth = 0
  let inStr: string | null = null
  for (let i = m[0].length - 1; i < code.length; i++) {
    const ch = code[i]
    if (inStr) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inStr)
        inStr = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '(') {
      depth++
    }
    else if (ch === ')') {
      depth--
      if (depth === 0)
        return code.slice(i + 1).trim().length === 0
    }
  }
  return false // condition not closed on this line
}
const RE_FOR_LOOP = /^\s*for\s*\(/
const RE_EMPTY_SEMI = new RegExp('^\\s*' + ';' + '\\s*$')
const RE_DUP_SEMI = new RegExp(';' + '{2,}\\s*$')
// Only after `)` or a word char (`if (x){`, `try{`) — `[{`, `({` and `${`
// must stay tight (#1369)
const RE_SPACE_BEFORE_BRACE = /([\w)])\{/g
const RE_SPACE_AFTER_BRACE_KW = /\{(return|if|for|while|switch|const|let|var|function)\b/g
const RE_COMMA_SPACE = /,(\S)/g
// Lookbehind also excludes compound assignment (`+=`, `-=`, `*=`, `/=`, `%=`,
// `&&=`, `||=`, `??=`, `^=`) — splitting them produced `t / = d` (#1369)
const RE_EQUALS_SPACE = /(?<![=!<>+\-*/%&|^?])=(?![=><])/g
const RE_PLUS_OP = /(\w)\+(\w)/g
const RE_MINUS_OP = /(\w)-(\w)/g
const RE_STAR_OP = /(\w)\*(\w)/g
const RE_SLASH_OP = /(\w)\/(\w)/g
// Lookbehind requires code before the `;` so the leading-semicolon ASI-guard
// idiom (`;(window as any).foo = ...`) keeps its conventional tight form
const RE_SEMI_SPACE = new RegExp('(?<=\\S);' + '([^\\s' + ';' + '])', 'g')
// Conservative on purpose: only space `<` / `>` against a numeric operand
// (`i<10`, `(a+b)>0`). Identifier-vs-identifier comparisons (`a<b`) are
// indistinguishable from generic type arguments (`Map<string, number>`,
// `foo<Bar>()`) on a single line, and `(\S)>` also matched the `>` of an
// unspaced arrow (`x=>y` → `x= > y`) — so those forms are left untouched
// rather than risk changing program semantics (#1369).
const RE_LT_OP = /([\w)\]])<(\d)/g
const RE_GT_OP = /([\w)\]])>(\d)/g
const RE_MULTI_SPACE = /\s{2,}/g
const RE_BLANK_LINE = /^\s*$/
const RE_LINE_COMMENT = /^\s*\/\//
const RE_BLOCK_COMMENT = /^\s*\/\*/
const RE_IMPORT_STMT = /^\s*import\b/
// An import statement is complete once its module source string is present:
// `... from 'mod'` or a side-effect `import 'mod'`
const RE_IMPORT_COMPLETE = /\bfrom\s*['"][^'"]+['"]|^\s*import\s+['"][^'"]+['"]/
const RE_PACKAGE_JSON = /package\.json$/i
const RE_TSCONFIG_JSON = /[jt]sconfig(?:\..+)?\.json$/i
const RE_TRAILING_WS = /[ \t]+$/
const RE_LEADING_BLANKS = /^\n+/

function getFileExt(filePath: string): string {
  const idx = filePath.lastIndexOf('.')
  return idx >= 0 ? filePath.slice(idx) : ''
}

function isCodeFileExt(filePath: string): boolean {
  return CODE_EXTS.has(getFileExt(filePath))
}

function isJsonFileExt(filePath: string): boolean {
  return JSON_EXTS.has(getFileExt(filePath))
}

function isYamlFileExt(filePath: string): boolean {
  return YAML_EXTS.has(getFileExt(filePath))
}

function isShellFileExt(filePath: string): boolean {
  return SHELL_EXTS.has(getFileExt(filePath))
}

function isShellFile(filePath: string, content: string): boolean {
  return isShellFileExt(filePath) || SHELL_SHEBANG_RE.test(content)
}

function processShellLinesFused(content: string, cfg: PickierConfig): string {
  const lines = content.split('\n')
  const len = lines.length
  const result = new Array<string>(len)
  const indentSize = cfg.format.indent
  const useTab = cfg.format.indentStyle === 'tabs'
  let indentLevel = 0
  let inHeredoc = false
  let heredocDelim = ''
  let inCase = false
  let caseDepth = 0

  for (let idx = 0; idx < len; idx++) {
    const line = lines[idx]

    // Empty lines pass through
    if (line.length === 0 || /^\s*$/.test(line)) {
      result[idx] = ''
      continue
    }

    // Inside heredoc: pass through unchanged
    if (inHeredoc) {
      result[idx] = line
      if (line.trim() === heredocDelim) {
        inHeredoc = false
        heredocDelim = ''
      }
      continue
    }

    // Detect heredoc start
    const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?/)
    if (heredocMatch) {
      inHeredoc = true
      heredocDelim = heredocMatch[1]
    }

    // Strip leading whitespace
    let wsEnd = 0
    while (wsEnd < line.length && (line.charCodeAt(wsEnd) === 32 || line.charCodeAt(wsEnd) === 9))
      wsEnd++
    const trimmed = line.slice(wsEnd).trimEnd()

    // Comment lines: just re-indent
    if (trimmed.startsWith('#') && idx > 0) {
      const indent = useTab ? '\t'.repeat(indentLevel) : ' '.repeat(indentLevel * indentSize)
      result[idx] = indent + trimmed
      continue
    }

    // Detect case/esac blocks
    if (/^case\b/.test(trimmed) && /\bin\s*$/.test(trimmed)) {
      caseDepth++
      inCase = true
    }
    if (/^esac\b/.test(trimmed)) {
      caseDepth = Math.max(0, caseDepth - 1)
      if (caseDepth === 0) inCase = false
    }

    // Determine if this is a case pattern line (only inside case blocks)
    // A case pattern ends with ) but is NOT a subshell/command-substitution
    const isCasePattern = inCase
      && /\)\s*$/.test(trimmed)
      && !/\$\(/.test(trimmed) // not command substitution
      && !/^\s*\(/.test(trimmed) // not subshell
      && !trimmed.startsWith('#')

    // Case terminator: ;; or ;& or ;;&
    const isCaseTerminator = /^;[;&]\s*$/.test(trimmed)

    // Check if line should decrease indent BEFORE applying
    const shouldDecrease = /^(?:fi|done|esac|elif|else)\b/.test(trimmed) || /^\}/.test(trimmed)

    if (shouldDecrease)
      indentLevel = Math.max(0, indentLevel - 1)
    if (isCaseTerminator)
      indentLevel = Math.max(0, indentLevel - 1)

    const indent = useTab ? '\t'.repeat(indentLevel) : ' '.repeat(indentLevel * indentSize)
    result[idx] = indent + trimmed

    // Check if line should increase indent AFTER applying
    if (/^then\b/.test(trimmed) || /^do\b/.test(trimmed) || /^else\b/.test(trimmed))
      indentLevel++
    else if (/^if\b/.test(trimmed) && /\bthen\s*$/.test(trimmed))
      indentLevel++
    else if (/^elif\b/.test(trimmed) && /\bthen\s*$/.test(trimmed))
      indentLevel++
    else if (/^(?:while|for|until)\b/.test(trimmed) && /\bdo\s*$/.test(trimmed))
      indentLevel++
    else if (/^case\b/.test(trimmed) && /\bin\s*$/.test(trimmed))
      indentLevel++
    else if (isCasePattern)
      indentLevel++
    else if (/\{\s*$/.test(trimmed) && !trimmed.startsWith('#'))
      indentLevel++
  }

  return result.join('\n')
}

function formatYaml(src: string, cfg: PickierConfig): string {
  try {
    const parsed = Bun.YAML.parse(src)
    const indent = cfg.format.indentStyle === 'tabs' ? '\t' : cfg.format.indent
    const result = Bun.YAML.stringify(parsed, null, indent)
    return result.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n')
  }
  catch {
    return src
  }
}

function toSpaces(count: number): string {
  return ' '.repeat(Math.max(0, count))
}

function makeIndent(visualLevels: number, cfg: PickierConfig): string {
  const style = cfg.format.indentStyle || 'spaces'
  if (style === 'tabs')
    return '\t'.repeat(Math.max(0, visualLevels))
  return toSpaces(Math.max(0, visualLevels * cfg.format.indent))
}

function convertDoubleToSingle(str: string): string {
  // strip surrounding quotes: "xyz" → xyz
  const inner = str.slice(1, -1)
  // Unescape escaped double quotes: \" → " (no longer needs escaping inside '...')
  // Callers guarantee the content has no unescaped single quotes.
  const result = inner.replace(/\\"/g, '"')
  return `'${result}'`
}

function convertSingleToDouble(str: string): string {
  const inner = str.slice(1, -1)
  // Unescape escaped single quotes: \' → '
  // Callers guarantee the content has no unescaped double quotes.
  const result = inner.replace(/\\'/g, '\'')
  return `"${result}"`
}

/**
 * A quoted string can only switch quote style without changing its runtime
 * value when it contains no unescaped occurrence of the target quote
 * (`"it's"` must stay double-quoted; rewriting it would corrupt the content).
 */
function hasUnescapedChar(content: string, ch: string): boolean {
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\') {
      i++
      continue
    }
    if (content[i] === ch)
      return true
  }
  return false
}

function fixQuotes(content: string, preferred: 'single' | 'double', filePath: string): string {
  if (!isCodeFileExt(filePath))
    return content
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++)
    lines[i] = fixQuotesLine(lines[i], preferred)
  return lines.join('\n')
}

/**
 * Fix quotes for a single line (extracted from fixQuotes for use in fused pipeline).
 * Converts string quote style to the preferred style.
 */
function fixQuotesLine(line: string, preferred: 'single' | 'double'): string {
  // Fast path: no quotes to convert
  const wantSingle = preferred === 'single'
  if (wantSingle ? !line.includes('"') : !line.includes('\''))
    return line

  const parts: string[] = []
  let i = 0
  let segStart = 0
  let inString: 0 | 1 | 2 | 3 = 0 // 0=none, 1=single, 2=double, 3=template
  let stringStart = 0

  while (i < line.length) {
    const ch = line[i]

    if (inString === 0) {
      if (ch === '/') {
        // Comments and regex literals are not strings — quotes inside them
        // must never be converted (corrupted /"([^"]*)"/ patterns, #1369)
        const nxt = line[i + 1]
        if (nxt === '/')
          break
        if (nxt === '*') {
          const end = line.indexOf('*/', i + 2)
          i = end === -1 ? line.length : end + 2
          continue
        }
        if (isRegexStart(line, i)) {
          const end = scanRegexEnd(line, i)
          if (end !== -1) {
            i = end
            continue
          }
        }
        i++
        continue
      }
      if (ch === '"') {
        inString = 2
        stringStart = i
        i++
        continue
      }
      if (ch === '\'') {
        inString = 1
        stringStart = i
        i++
        continue
      }
      if (ch === '`') {
        inString = 3
        i++
        continue
      }
      i++
    }
    else if (inString === 3) {
      // template literal — just scan for closing backtick
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '`') inString = 0
      i++
    }
    else {
      // single or double string
      if (ch === '\\') {
        i += 2
        continue
      }
      const closeChar = inString === 1 ? '\'' : '"'
      if (ch === closeChar) {
        // Found closing quote — convert if needed
        const stringContent = line.slice(stringStart + 1, i)
        const targetQuote = wantSingle ? '\'' : '"'
        const needConvert = ((inString === 2 && wantSingle) || (inString === 1 && !wantSingle))
          && !hasUnescapedChar(stringContent, targetQuote)
        if (needConvert) {
          // Flush segment before string
          if (stringStart > segStart)
            parts.push(line.slice(segStart, stringStart))
          if (inString === 2)
            parts.push(convertDoubleToSingle(`"${stringContent}"`))
          else
            parts.push(convertSingleToDouble(`'${stringContent}'`))
          segStart = i + 1
        }
        inString = 0
        i++
        continue
      }
      i++
    }
  }

  // If no conversions happened, return original
  if (parts.length === 0)
    return line

  // Flush unclosed string or trailing segment
  if (segStart < line.length)
    parts.push(line.slice(segStart))
  return parts.join('')
}

/**
 * Normalize spacing for a single line (extracted from normalizeCodeSpacing).
 * Uses pre-compiled regex patterns and fast-path maskStrings.
 */
// Characters that trigger spacing normalization — if none are present, skip all 11 regex passes
const SPACING_CHARS = new Set(['{', ',', '=', '+', '-', '*', '/', ';', '<', '>'])

function normalizeSpacingLine(line: string): string {
  // Fast path: skip very short lines (closing braces, etc.)
  if (line.length < 4)
    return line

  // Fast path: skip comment lines
  let firstNonSpace = 0
  while (firstNonSpace < line.length && (line[firstNonSpace] === ' ' || line[firstNonSpace] === '\t'))
    firstNonSpace++
  if (firstNonSpace < line.length) {
    const c = line[firstNonSpace]
    if (c === '/' && (line[firstNonSpace + 1] === '/' || line[firstNonSpace + 1] === '*'))
      return line
    // Block-comment continuation lines (`* ...` inside /** ... */) are prose,
    // not code — spacing rules corrupted JSDoc examples like `${expr}` (#1369).
    if (c === '*')
      return line
  }

  // Fast path: if no operator/punctuation characters exist, nothing to normalize
  let hasSpacingChar = false
  for (let j = firstNonSpace; j < line.length; j++) {
    if (SPACING_CHARS.has(line[j])) {
      hasSpacingChar = true
      break
    }
  }
  if (!hasSpacingChar)
    return line

  const { text, strings } = maskStrings(line)
  let t = text
  t = t.replace(RE_SPACE_BEFORE_BRACE, '$1 {')
  t = t.replace(RE_SPACE_AFTER_BRACE_KW, '{ $1')
  t = t.replace(RE_COMMA_SPACE, ', $1')
  t = t.replace(RE_EQUALS_SPACE, ' = ')
  t = t.replace(RE_PLUS_OP, '$1 + $2')
  t = t.replace(RE_MINUS_OP, '$1 - $2')
  t = t.replace(RE_STAR_OP, '$1 * $2')
  t = t.replace(RE_SLASH_OP, '$1 / $2')
  t = t.replace(RE_SEMI_SPACE, '; $1')
  t = t.replace(RE_LT_OP, '$1 < $2')
  t = t.replace(RE_GT_OP, '$1 > $2')

  // Collapse multi-spaces in code (not leading whitespace)
  if (firstNonSpace > 0) {
    const rest = t.slice(firstNonSpace)
    t = t.slice(0, firstNonSpace) + rest.replace(RE_MULTI_SPACE, ' ')
  }
  else {
    t = t.replace(RE_MULTI_SPACE, ' ')
  }

  return strings.length > 0 ? unmaskStrings(t, strings) : t
}

// ── Multi-line template-literal tracking ──────────────────────────────────
// The line-based formatter must never touch the *contents* of a template
// literal (re-indenting, re-spacing `${` → `$ {`, re-quoting, or trimming would
// corrupt the string and break interpolation). These helpers track, line by
// line, whether we are inside a template literal's text so such lines can be
// emitted verbatim. The scan degrades safely: on exotic input it can only ever
// under-format (skip a line), never corrupt one.
// `start` records the index of the backtick that opened the template, but only
// while scanning the line on which it opened (carried-over contexts from earlier
// lines are reset to -1 on entry). It lets callers split an opening line into a
// formattable code prefix and a verbatim template tail.
type TmplCtx = { t: 'tmpl', start: number } | { t: 'interp', braces: number }

/** True when the next character to process is inside template *text*. */
function inTemplateText(stack: TmplCtx[]): boolean {
  const top = stack[stack.length - 1]
  return top !== undefined && top.t === 'tmpl'
}

/** Skip a normal '...' / "..." string; returns the index past the close. */
function skipQuoted(line: string, i: number, quote: string): number {
  i++
  while (i < line.length) {
    const c = line[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === quote)
      return i + 1
    i++
  }
  return i
}

/**
 * Advance template-literal tracking across one line (mutates `stack`). `stack`
 * records nested template / `${...}` interpolation contexts so callers know,
 * per line, whether they're inside template text.
 *
 * Returns the split index for a line that *begins* in code but *ends* inside
 * template text: the position of the backtick that opened the outermost template
 * still open at end-of-line. Everything from that index to EOL is verbatim
 * template content; the prefix before it is ordinary code. Returns -1 when the
 * line does not end inside a template opened on this line (callers fall back to
 * their start-of-line `inTemplateText` check for fully-interior lines).
 */
function advanceTemplateState(line: string, stack: TmplCtx[]): number {
  // Carried-over template contexts opened on earlier lines are not split points
  // for *this* line — their text already started before column 0.
  for (const ctx of stack) {
    if (ctx.t === 'tmpl')
      ctx.start = -1
  }
  let i = 0
  while (i < line.length) {
    const top = stack[stack.length - 1]
    const ch = line[i]

    if (top === undefined || top.t === 'interp') {
      // Code context: top level, or inside ${ ... }.
      if (ch === '`') {
        stack.push({ t: 'tmpl', start: i })
        i++
        continue
      }
      if (ch === '\'' || ch === '"') {
        i = skipQuoted(line, i, ch)
        continue
      }
      if (ch === '/' && line[i + 1] === '/')
        break // line comment — nothing template-relevant after it
      if (top !== undefined) {
        // Inside ${...}: balance braces so the matching } closes the interp.
        if (ch === '{') {
          top.braces++
          i++
          continue
        }
        if (ch === '}') {
          if (top.braces === 0)
            stack.pop()
          else
            top.braces--
          i++
          continue
        }
      }
      i++
    }
    else {
      // Inside template text.
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '`') {
        stack.pop()
        i++
        continue
      }
      if (ch === '$' && line[i + 1] === '{') {
        stack.push({ t: 'interp', braces: 0 })
        i += 2
        continue
      }
      i++
    }
  }

  // If the line ends inside template text, find the outermost (bottom-most)
  // template opened on this line — its backtick is where verbatim content begins.
  if (inTemplateText(stack)) {
    for (const ctx of stack) {
      if (ctx.t === 'tmpl' && ctx.start >= 0)
        return ctx.start
    }
  }
  return -1
}

/**
 * Determine whether a line ends inside a /* ... *​/ block comment.
 * `startsIn` is the state carried over from the previous line. Quoted strings
 * and template literals are skipped so comment markers inside them don't
 * flip the state; `//` line comments end scanning for the rest of the line.
 */
function blockCommentStateAfter(line: string, startsIn: boolean): boolean {
  let inBlock = startsIn
  let inStr: string | null = null
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (inBlock) {
      if (ch === '*' && line[i + 1] === '/') {
        inBlock = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (inStr) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === inStr)
        inStr = null
      i++
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inStr = ch
      i++
      continue
    }
    if (ch === '/') {
      if (line[i + 1] === '/')
        break
      if (line[i + 1] === '*') {
        inBlock = true
        i += 2
        continue
      }
    }
    i++
  }
  return inBlock
}

/**
 * Fused single-pass code line processor.
 * Combines fixQuotes + fixIndentation + normalizeCodeSpacing + removeStylisticSemicolons
 * into ONE split/join cycle instead of four separate ones.
 */
function processCodeLinesFused(content: string, cfg: PickierConfig): string {
  const lines = content.split('\n')
  const len = lines.length
  const result = new Array<string>(len)
  const preferred = cfg.format.quotes
  const doSemiRemoval = cfg.format.semi === true
  let indentLevel = 0
  let hangDepth = 0
  let inBlockComment = false
  const tmplStack: TmplCtx[] = []

  for (let idx = 0; idx < len; idx++) {
    let line = lines[idx]

    // Lines inside a multi-line /* ... */ comment are prose, not code — emit
    // them verbatim. Re-indenting stripped the conventional ` * ` alignment
    // (which hasIndentIssue explicitly accepts) and quote/spacing rules
    // rewrote JSDoc text and code examples (#1369).
    if (inBlockComment) {
      inBlockComment = blockCommentStateAfter(line, true)
      result[idx] = line
      continue
    }

    // Lines inside a multi-line template literal's text are emitted verbatim —
    // re-indenting / re-spacing them corrupts the string and breaks ${...}.
    const protectedLine = inTemplateText(tmplStack)
    let splitIdx = -1
    if (tmplStack.length > 0 || line.indexOf('`') !== -1)
      splitIdx = advanceTemplateState(line, tmplStack)
    if (protectedLine) {
      result[idx] = line
      continue
    }

    // Track whether this plain code line leaves us inside a block comment.
    // Template-involved lines are skipped: their backtick content is already
    // handled above and must not be mistaken for comment markers.
    if (splitIdx < 0 && tmplStack.length === 0)
      inBlockComment = blockCommentStateAfter(line, false)

    // The line begins in code but ends inside a template opened on this line.
    // Format only the code prefix and re-attach the template tail verbatim so its
    // trailing whitespace / internal spacing is never collapsed (issue #1361).
    let tmplTail = ''
    let prefixEndedWithSpace = false
    if (splitIdx >= 0) {
      tmplTail = line.slice(splitIdx)
      const prefix = line.slice(0, splitIdx)
      if (prefix.length === 0) {
        result[idx] = tmplTail
        continue
      }
      prefixEndedWithSpace = RE_TRAILING_WS.test(prefix)
      line = prefix
    }

    if (line.length === 0) {
      result[idx] = ''
      continue
    }

    // Phase 1: Fix quotes
    line = fixQuotesLine(line, preferred)

    // Phase 2: Fix indentation (manual char loop avoids regex overhead)
    let wsEnd = 0
    while (wsEnd < line.length && (line.charCodeAt(wsEnd) === 32 || line.charCodeAt(wsEnd) === 9))
      wsEnd++
    const trimmed = line.slice(wsEnd).trimEnd()

    if (RE_CLOSING_BRACE.test(trimmed))
      indentLevel = Math.max(0, indentLevel - 1)

    // Continuation lines (`.method()` chains, ternary `?` / `:` branches,
    // `&&` / `||` operands) conventionally sit one level deeper than the
    // statement they continue — previously they were flattened (#1369)
    const continuationBump = RE_CONTINUATION_LINE.test(trimmed) ? 1 : 0

    line = makeIndent(indentLevel + hangDepth + continuationBump, cfg) + trimmed

    if (RE_OPENING_BRACE.test(trimmed)) {
      indentLevel += 1
      hangDepth = 0
    }
    else if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) {
      // Brace-less control flow (`if (x)` / `else` / `for (...)` without `{`)
      // hangs its single statement one level deeper; previously that
      // statement was snapped back to the enclosing level (#1369).
      const code = trimmed.replace(RE_TRAILING_LINE_COMMENT, '')
      hangDepth = isHangingControlLine(code) ? hangDepth + 1 : 0
    }

    // Phase 3: Normalize spacing
    line = normalizeSpacingLine(line)

    // Phase 4: Remove stylistic semicolons (if enabled)
    if (doSemiRemoval) {
      if (!RE_FOR_LOOP.test(line)) {
        if (RE_EMPTY_SEMI.test(line)) {
          line = ''
        }
        else {
          line = line.replace(RE_DUP_SEMI, ';')
        }
      }
    }

    if (splitIdx >= 0) {
      // Restore a single separating space the prefix may have had before the
      // backtick (e.g. `return \`…\``), then append the untouched template tail.
      if (prefixEndedWithSpace && !RE_TRAILING_WS.test(line))
        line += ' '
      line += tmplTail
    }

    result[idx] = line
  }

  return result.join('\n')
}

function collapseBlankLines(lines: string[], maxConsecutive: number): string[] {
  const out: string[] = []
  let blank = 0
  const stack: TmplCtx[] = []
  for (const l of lines) {
    // Blank lines inside a multi-line template literal are part of the string —
    // keep them verbatim rather than collapsing them.
    const protectedLine = inTemplateText(stack)
    if (stack.length > 0 || l.indexOf('`') !== -1)
      advanceTemplateState(l, stack)
    if (protectedLine) {
      out.push(l)
      blank = 0
      continue
    }
    if (l === '') {
      blank++
      if (blank <= maxConsecutive)
        out.push('')
    }
    else {
      blank = 0
      out.push(l)
    }
  }
  return out
}

export function formatCode(src: string, cfg: PickierConfig, filePath: string): string {
  if (src.length === 0)
    return ''

  // OPTIMIZATION: Only replace \r\n when the file actually contains \r
  const normalized = src.includes('\r') ? src.replace(/\r\n/g, '\n') : src
  const rawLines = normalized.split('\n')
  let lines: string[]

  if (cfg.format.trimTrailingWhitespace) {
    // Combine trimming and blank line collapsing in one pass
    lines = []
    let blank = 0
    const maxConsecutive = Math.max(0, cfg.format.maxConsecutiveBlankLines)
    const stack: TmplCtx[] = []

    for (const l of rawLines) {
      // Inside a multi-line template literal, keep the line verbatim — trimming
      // trailing whitespace or collapsing blanks would change the string value.
      // `endsInTemplate` covers the opening line, whose tail (after the backtick)
      // is template content even though the line *starts* in code (issue #1361).
      const protectedLine = inTemplateText(stack)
      let endsInTemplate = false
      if (stack.length > 0 || l.indexOf('`') !== -1)
        endsInTemplate = advanceTemplateState(l, stack) >= 0
      if (protectedLine || endsInTemplate) {
        lines.push(l)
        blank = 0
        continue
      }

      // Fast path: skip regex for lines that don't end with whitespace
      const last = l[l.length - 1]
      const trimmed = (last === ' ' || last === '\t') ? l.replace(RE_TRAILING_WS, '') : l
      if (trimmed === '') {
        blank++
        if (blank <= maxConsecutive)
          lines.push('')
      }
      else {
        blank = 0
        lines.push(trimmed)
      }
    }
  }
  else {
    // Just collapse blank lines
    lines = collapseBlankLines(rawLines, Math.max(0, cfg.format.maxConsecutiveBlankLines))
  }

  let joined = lines.join('\n')
  // Remove any leading blank lines at the top of the file
  joined = joined.replace(RE_LEADING_BLANKS, '')

  // import management (ts/js only)
  if (isCodeFileExt(filePath))
    joined = formatImports(joined)

  // yaml formatting via Bun.YAML
  if (isYamlFileExt(filePath)) {
    const formatted = formatYaml(joined, cfg)
    if (formatted !== joined)
      joined = formatted
  }

  // json/package/tsconfig sorting
  if (isJsonFileExt(filePath)) {
    const sorted = trySortKnownJson(joined, filePath)
    if (sorted != null)
      joined = sorted
  }

  // Shell formatting: indentation normalization
  if (isShellFile(filePath, joined)) {
    joined = processShellLinesFused(joined, cfg)
  }
  // FUSED: quotes + indentation + spacing + semicolons in ONE split/join pass
  else if (isCodeFileExt(filePath)) {
    joined = processCodeLinesFused(joined, cfg)
  }
  else {
    joined = fixQuotes(joined, cfg.format.quotes, filePath)
  }

  // ensure final newline policy
  if (cfg.format.finalNewline === 'none') {
    return joined.replace(/\n+$/g, '')
  }

  // For idempotency: if file already has 1-2 trailing newlines and we want "one", keep it stable
  // This prevents oscillation when imports are added/removed
  const hasOneNewline = /[^\n]\n$/.test(joined) || joined === '\n'
  const hasTwoNewlines = /\n\n$/.test(joined)

  if (cfg.format.finalNewline === 'two') {
    // Always want exactly two newlines
    if (hasTwoNewlines)
      return joined
    if (hasOneNewline)
      return `${joined}\n`
    return `${joined}\n\n`
  }

  // finalNewline === 'one': always ensure exactly one newline (stable and idempotent)
  if (hasTwoNewlines) {
    // Reduce from 2 to 1
    return joined.replace(/\n\n$/, '\n')
  }
  if (hasOneNewline) {
    return joined
  }
  return `${joined}\n`
}

/**
 * Whether the string opening at `openIdx` can switch to the target quote style
 * without changing its runtime value — i.e. it contains no unescaped target
 * quote before its closing quote. Mirrors the fixer's guard so the linter
 * never flags a quote the fixer refuses to rewrite.
 */
function quoteConvertible(line: string, openIdx: number, quote: string, target: string): boolean {
  for (let j = openIdx + 1; j < line.length; j++) {
    const c = line[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === quote)
      return true
    if (c === target)
      return false
  }
  return true
}

export function detectQuoteIssues(line: string, preferred: 'single' | 'double'): number[] {
  // return character indices (0-based) where offending quote starts

  // Skip TypeScript triple-slash directives (they must use double quotes)
  if (/^\s*\/\/\/\s*<reference/.test(line)) {
    return []
  }

  const indices: number[] = []

  // Track if we're inside any type of string to avoid flagging quotes inside them
  let inString: 'single' | 'double' | 'template' | null = null
  let escaped = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\') {
      escaped = true
      continue
    }

    // Check for string boundaries
    if (!inString) {
      // Not inside any string - check if we're entering one
      if (ch === '/' && line[i + 1] === '/') {
        // Rest of the line is a comment — quotes there are prose, not code
        break
      }
      if (ch === '\'') {
        if (preferred === 'double' && quoteConvertible(line, i, '\'', '"')) {
          // Single quote when double is preferred
          indices.push(i)
        }
        inString = 'single'
        continue
      }
      else if (ch === '"') {
        if (preferred === 'single' && quoteConvertible(line, i, '"', '\'')) {
          // Double quote when single is preferred
          indices.push(i)
        }
        inString = 'double'
        continue
      }
      else if (ch === '`') {
        inString = 'template'
        continue
      }
    }
    else {
      // Inside a string - check if we're exiting
      if ((inString === 'single' && ch === '\'')
        || (inString === 'double' && ch === '"')
        || (inString === 'template' && ch === '`')) {
        inString = null
        continue
      }
    }
  }

  return indices
}

export function hasIndentIssue(
  leading: string,
  indentSize: number,
  indentStyle: 'spaces' | 'tabs' = 'spaces',
  lineContent?: string,
): boolean {
  if (indentStyle === 'tabs') {
    // For tabs style, require leading indentation to be tabs only
    return /[^\t]/.test(leading)
  }
  if (/\t/.test(leading))
    return true
  const spaces = leading.length

  // Block comment continuation lines ( * ...) and closing ( */) use
  // base_indent + 1 space for * alignment — this is standard convention
  // in JS/TS/CSS and should not be flagged
  if (lineContent && spaces % indentSize === 1) {
    const trimmed = lineContent.trimStart()
    if (trimmed.startsWith('* ') || trimmed.startsWith('*/') || trimmed === '*')
      return false
  }

  return spaces % indentSize !== 0
}

/**
 * Skip a template literal starting at `input[start] === '\`'`, returning the
 * index just past its closing backtick. Handles `${...}` interpolations —
 * including nested templates and quoted strings inside them — by balancing
 * braces, so the *correct* closing backtick is found rather than the first
 * backtick of a nested template. Returns input.length for an unterminated
 * (multi-line) opening.
 */
function skipTemplate(input: string, start: number): number {
  let i = start + 1
  while (i < input.length) {
    const c = input[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`')
      return i + 1
    if (c === '$' && input[i + 1] === '{') {
      i += 2
      let depth = 1
      while (i < input.length && depth > 0) {
        const d = input[i]
        if (d === '\\') {
          i += 2
          continue
        }
        if (d === '`') {
          i = skipTemplate(input, i)
          continue
        }
        if (d === '\'' || d === '"') {
          i = skipQuoted(input, i, d)
          continue
        }
        if (d === '{')
          depth++
        else if (d === '}')
          depth--
        i++
      }
      continue
    }
    i++
  }
  return i
}

// Keywords after which a `/` starts a regex literal rather than division
const REGEX_PRECEDING_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'case', 'yield', 'await'])

/**
 * Heuristic: does the `/` at `slashIdx` start a regex literal (vs division)?
 * A regex can start after an operator/opening punctuator or certain keywords;
 * after an identifier, number, `)` or `]` a `/` is division.
 */
function isRegexStart(input: string, slashIdx: number): boolean {
  let j = slashIdx - 1
  while (j >= 0 && (input[j] === ' ' || input[j] === '\t'))
    j--
  if (j < 0)
    return true
  const prev = input[j]
  if ('(,=:[!&|?;{}<>+-*%^~'.includes(prev))
    return true
  if (/[\w$]/.test(prev)) {
    let k = j
    while (k >= 0 && /[\w$]/.test(input[k]))
      k--
    return REGEX_PRECEDING_KEYWORDS.has(input.slice(k + 1, j + 1))
  }
  return false
}

/**
 * Scan a regex literal starting at `start` (pointing at the opening `/`).
 * Handles `\` escapes and `[...]` character classes (where `/` is literal).
 * Returns the index just past the closing `/` and its flags, or -1 when the
 * literal does not terminate on this line (then treated as division).
 */
function scanRegexEnd(input: string, start: number): number {
  let i = start + 1
  let inClass = false
  while (i < input.length) {
    const c = input[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '[') {
      inClass = true
    }
    else if (c === ']') {
      inClass = false
    }
    else if (c === '/' && !inClass) {
      i++
      while (i < input.length && /[a-z]/i.test(input[i]))
        i++
      return i
    }
    i++
  }
  return -1
}

function maskStrings(input: string): { text: string, strings: string[] } {
  // Fast path: no quotes or slashes at all — skip character scan
  if (!input.includes('\'') && !input.includes('"') && !input.includes('`') && !input.includes('/'))
    return { text: input, strings: [] }

  const strings: string[] = []
  const parts: string[] = []
  let i = 0
  let segStart = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === '/') {
      const next = input[i + 1]
      if (next === '/') {
        // Trailing line comment — prose, masked so spacing rules don't
        // rewrite hyphenated words (`as-is` → `as - is`, #1369)
        if (i > segStart)
          parts.push(input.slice(segStart, i))
        strings.push(input.slice(i))
        parts.push(`@@S${strings.length - 1}@@`)
        segStart = input.length
        break
      }
      if (next === '*') {
        // Inline block comment — masked for the same reason
        const end = input.indexOf('*/', i + 2)
        const stop = end === -1 ? input.length : end + 2
        if (i > segStart)
          parts.push(input.slice(segStart, i))
        strings.push(input.slice(i, stop))
        parts.push(`@@S${strings.length - 1}@@`)
        i = stop
        segStart = i
        continue
      }
      if (isRegexStart(input, i)) {
        const end = scanRegexEnd(input, i)
        if (end !== -1) {
          // Mask the regex literal — spacing rules corrupted quantifiers
          // (`/a{2,3}/` → `/a {2, 3}/`) and character classes (#1369).
          if (i > segStart)
            parts.push(input.slice(segStart, i))
          strings.push(input.slice(i, end))
          parts.push(`@@S${strings.length - 1}@@`)
          i = end
          segStart = i
          continue
        }
      }
      i++
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      // Flush non-string segment
      if (i > segStart)
        parts.push(input.slice(segStart, i))
      const start = i
      if (ch === '`') {
        // Template: skip ${...} interpolations (which may contain nested
        // templates/strings) so the real closing backtick is matched.
        i = skipTemplate(input, i)
      }
      else {
        const close = ch
        i++
        while (i < input.length) {
          if (input[i] === '\\') {
            i += 2
            continue
          }
          if (input[i] === close) {
            i++
            break
          }
          i++
        }
      }
      strings.push(input.slice(start, i))
      parts.push(`@@S${strings.length - 1}@@`)
      segStart = i
      continue
    }
    i++
  }
  // Flush trailing segment
  if (segStart < input.length)
    parts.push(input.slice(segStart))
  return { text: parts.join(''), strings }
}

function unmaskStrings(text: string, strings: string[]): string {
  if (strings.length === 0)
    return text
  return text.replace(/@@S(\d+)@@/g, (_, idx: string) => strings[Number(idx)] ?? '')
}

type ImportKind = 'value' | 'type' | 'side-effect'

interface ParsedImport {
  kind: ImportKind
  source: string
  defaultName?: string
  namespaceName?: string
  named: Array<{ name: string, alias?: string }>
  namedTypes: Array<{ name: string, alias?: string }>
  original: string
}

function collectIdentifierSet(text: string): Set<string> {
  const identifiers = new Set<string>()
  const identifierRe = /[$A-Z_][\w$]*/gi
  let match = identifierRe.exec(text)
  while (match !== null) {
    identifiers.add(match[0])
    match = identifierRe.exec(text)
  }
  return identifiers
}

export function formatImports(source: string): string {
  // Fast path: if file doesn't start with import/comment/blank, no import block to process
  const firstChar = source[0]
  if (firstChar !== 'i' && firstChar !== ' ' && firstChar !== '\t' && firstChar !== '/' && firstChar !== '\n')
    return source

  const lines = source.split('\n')
  const imports: ParsedImport[] = []
  // Comments must survive import organization (#1369 — they were silently
  // deleted before): lines before the first import stay above the block,
  // comments between imports are re-emitted after it, and comments after the
  // last import (e.g. a JSDoc for the following declaration) belong to `rest`.
  const preamble: string[] = []
  const interleaved: string[] = []
  let idx = 0
  let lastEnd = 0 // just past the last consumed import statement
  let pendingStart = -1 // first comment line seen after the last import
  let sawImport = false

  while (idx < lines.length) {
    const line = lines[idx]
    if (RE_BLANK_LINE.test(line)) {
      idx++
      continue
    }
    if (RE_LINE_COMMENT.test(line) || RE_BLOCK_COMMENT.test(line)) {
      const start = idx
      if (RE_BLOCK_COMMENT.test(line)) {
        // consume the whole /* ... */ block (may span lines)
        while (idx < lines.length && !lines[idx].includes('*/'))
          idx++
        idx++
      }
      else {
        idx++
      }
      if (!sawImport) {
        for (let k = start; k < idx && k < lines.length; k++)
          preamble.push(lines[k])
        lastEnd = idx
      }
      else if (pendingStart < 0) {
        pendingStart = start
      }
      continue
    }
    if (!RE_IMPORT_STMT.test(line))
      break
    // Multi-line import statements: join lines until the module source string
    // appears. Previously the opening `import {` line was consumed and the
    // remaining specifier lines left behind as broken syntax (#1369).
    let stmt = line.trim()
    let stmtEnd = idx + 1
    while (!RE_IMPORT_COMPLETE.test(stmt) && stmtEnd < lines.length && stmtEnd - idx < 50) {
      stmt += ` ${lines[stmtEnd].trim()}`
      stmtEnd++
    }
    if (!RE_IMPORT_COMPLETE.test(stmt))
      return source
    const parsed = parseImportStatement(stmt)
    if (!parsed)
      return source
    // comments buffered since the previous import are interleaved — keep them
    if (pendingStart >= 0) {
      for (let k = pendingStart; k < idx; k++) {
        if (!RE_BLANK_LINE.test(lines[k]))
          interleaved.push(lines[k])
      }
      pendingStart = -1
    }
    imports.push(parsed)
    idx = stmtEnd
    lastEnd = idx
    sawImport = true
  }
  if (imports.length === 0)
    return source

  // Trailing comments (no import after them) belong to the following code
  const restStart = pendingStart >= 0 ? pendingStart : lastEnd
  const rest = lines.slice(restStart).join('\n')

  // Remove unused only for simple named (no alias). Keep defaults, namespaces, and all type specifiers.
  const usedIdentifiers = collectIdentifierSet(rest)
  const used = (name: string): boolean => usedIdentifiers.has(name)
  for (const imp of imports) {
    if (imp.kind !== 'value')
      continue
    // keep default and namespace regardless
    imp.named = imp.named.filter((s) => {
      // if alias present, keep
      if (s.alias)
        return true
      return used(s.name)
    })
    // keep all type specifiers
  }

  // drop empty value type imports unless side-effect
  const nonEmpty = imports.filter((imp) => {
    if (imp.kind === 'side-effect')
      return true
    if (imp.kind === 'type')
      return imp.namedTypes.length > 0
    return Boolean(imp.defaultName || imp.namespaceName || imp.named.length > 0)
  })

  // merge by source into one value and one type per module
  const bySource: Map<string, { value?: ParsedImport, type?: ParsedImport, side?: ParsedImport[] }> = new Map()
  for (const imp of nonEmpty) {
    const bucket = bySource.get(imp.source) || {}
    if (imp.kind === 'side-effect') {
      bucket.side = bucket.side || []
      bucket.side.push(imp)
    }
    else if (imp.kind === 'type') {
      if (!bucket.type)
        bucket.type = { kind: 'type', source: imp.source, named: [], namedTypes: [], original: '' }
      bucket.type.namedTypes = (bucket.type.namedTypes || []).concat(imp.namedTypes)
    }
    else {
      if (!bucket.value)
        bucket.value = { kind: 'value', source: imp.source, named: [], namedTypes: [], original: '' }
      if (imp.defaultName)
        bucket.value.defaultName = imp.defaultName
      if (imp.namespaceName)
        bucket.value.namespaceName = imp.namespaceName
      bucket.value.named = (bucket.value.named || []).concat(imp.named)
      // if imp has namedTypes mixed in value, move them to type bucket
      if (imp.namedTypes.length > 0) {
        if (!bucket.type)
          bucket.type = { kind: 'type', source: imp.source, named: [], namedTypes: [], original: '' }
        bucket.type.namedTypes = bucket.type.namedTypes.concat(imp.namedTypes)
      }
    }
    bySource.set(imp.source, bucket)
  }

  // build output imports
  const entries: ParsedImport[] = []
  for (const [_sourcePath, bucket] of bySource) {
    if (bucket.side)
      entries.push(...bucket.side)
    if (bucket.value) {
      // flip alias direction only for simple one-letter aliases in value named specifiers
      const flipIfSimple = (s: { name: string, alias?: string }) => {
        if (!s.alias)
          return s
        const simple = /^[A-Z]$/i.test(s.name) && /^[A-Z]$/i.test(s.alias)
        return simple ? { name: s.alias, alias: s.name } : s
      }
      bucket.value.named = bucket.value.named.map(flipIfSimple)
      // sort by left-side identifier
      bucket.value.named.sort((a, b) => a.name.localeCompare(b.name))
      entries.push(bucket.value)
    }
    if (bucket.type && bucket.type.namedTypes.length > 0) {
      // dedupe and sort
      const seen = new Set<string>()
      const flipIfSimple = (s: { name: string, alias?: string }) => {
        if (!s.alias)
          return s
        const simple = /^[A-Z]$/i.test(s.name) && /^[A-Z]$/i.test(s.alias)
        return simple ? { name: s.alias, alias: s.name } : s
      }
      bucket.type.namedTypes = bucket.type.namedTypes.map(flipIfSimple)
        .filter((s) => {
          const k = `${s.name}|${s.alias || ''}`
          if (seen.has(k))
            return false
          seen.add(k)
          return true
        })
      bucket.type.namedTypes.sort((a, b) => a.name.localeCompare(b.name))
      entries.push(bucket.type)
    }
  }

  // sort modules: types first, then side-effects, then values.
  // Within type and value kinds, sort externals before relatives. For values with same rank, sort by form (default, namespace, named), then by source.
  const rank = (p: string) => p.startsWith('.') ? 2 : (p.startsWith('node:') ? 0 : 1)
  const formRank = (imp: ParsedImport): number => {
    if (imp.kind !== 'value')
      return 99
    if (imp.defaultName)
      return 0
    if (imp.namespaceName)
      return 1
    return 2
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) {
      if (a.kind === 'type')
        return -1
      if (b.kind === 'type')
        return 1
      if (a.kind === 'side-effect')
        return -1
      if (b.kind === 'side-effect')
        return 1
    }
    if (a.kind === 'type' && b.kind === 'type') {
      const ra = rank(a.source)
      const rb = rank(b.source)
      if (ra !== rb)
        return ra - rb
      return a.source.localeCompare(b.source)
    }
    if (a.kind === 'value' && b.kind === 'value') {
      const ra = rank(a.source)
      const rb = rank(b.source)
      if (ra !== rb)
        return ra - rb
      const fa = formRank(a)
      const fb = formRank(b)
      if (fa !== fb)
        return fa - fb
      return a.source.localeCompare(b.source)
    }
    return a.source.localeCompare(b.source)
  })

  const head = preamble.length > 0 ? `${preamble.join('\n')}\n` : ''

  // If no imports remain after filtering, return the rest without import block
  if (entries.length === 0) {
    const restClean = rest.replace(/^\n+/, '')
    const kept = [...interleaved]
    if (head || kept.length > 0)
      return `${head}${kept.length > 0 ? `${kept.join('\n')}\n` : ''}${restClean}`
    return restClean
  }

  const rendered = entries.map(renderImport).join('\n')
  const mid = interleaved.length > 0 ? `\n${interleaved.join('\n')}` : ''
  // ensure a trailing blank line after imports if there is following code
  const restClean = rest.replace(/^\n+/, '')
  const sep = restClean.length > 0 ? '\n\n' : '\n'
  return `${head}${rendered}${mid}${sep}${restClean}`
}

function renderImport(imp: ParsedImport): string {
  if (imp.kind === 'side-effect')
    return `import '${imp.source}'`
  if (imp.kind === 'type') {
    const named = imp.namedTypes.map(s => s.alias ? `${s.name} as ${s.alias}` : s.name).join(', ')
    return `import type { ${named} } from '${imp.source}'`
  }
  const parts: string[] = []
  if (imp.defaultName)
    parts.push(imp.defaultName)
  if (imp.namespaceName)
    parts.push(`* as ${imp.namespaceName}`)
  if (imp.named.length > 0) {
    const named = imp.named.map(s => s.alias ? `${s.name} as ${s.alias}` : s.name).join(', ')
    parts.push(`{ ${named} }`)
  }
  const left = parts.join(', ')
  return `import ${left} from '${imp.source}'`
}

function parseImportStatement(stmt: string): ParsedImport | undefined {
  // side-effect: import 'module'
  let m = stmt.match(/^\s*import\s+['"]([^'"]+)['"]/)
  if (m) {
    return { kind: 'side-effect', source: m[1], named: [], namedTypes: [], original: stmt }
  }
  // type-only: import type { A, B as C } from 'x'
  m = stmt.match(/^\s*import\s+type\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/)
  if (m) {
    const spec = m[1]
    const source = m[2]
    const namedTypes = spec.split(',').map(s => s.trim()).filter(Boolean).map((s) => {
      const mm = s.match(/^(\w+)(?:\s+as\s+(\w+))?$/)
      return { name: mm?.[1] || s, alias: mm?.[2] }
    })
    return { kind: 'type', source, named: [], namedTypes, original: stmt }
  }
  // value import: default/namespace/named (with possible "type" in named)
  // Use non-backtracking parsing: locate the leading "import" and trailing "from 'src'" and slice
  const importLead = stmt.match(/^\s*import\s+/)
  const fromMatchRe = new RegExp('\\sfrom\\s+[\'"]([^\'"]+)[\'"]\\s*' + ';' + '?$')
  const fromMatch = stmt.match(fromMatchRe)
  if (!importLead || !fromMatch)
    return undefined
  const source = fromMatch[1]
  let left = stmt.slice(importLead[0].length, fromMatch.index).trim()
  let defaultName: string | undefined
  let namespaceName: string | undefined
  const named: Array<{ name: string, alias?: string }> = []
  const namedTypes: Array<{ name: string, alias?: string }> = []

  // extract named group if any
  const namedMatch = left.match(/\{([^}]*)\}/)
  if (namedMatch) {
    const inner = namedMatch[1]
    const items = inner.split(',').map(s => s.trim()).filter(Boolean)
    for (const it of items) {
      const isType = /^type\s+/.test(it)
      const t = it.replace(/^type\s+/, '')
      const mm = t.match(/^(\w+)(?:\s+as\s+(\w+))?$/)
      if (!mm)
        continue
      const entry = { name: mm[1], alias: mm[2] }
      if (isType)
        namedTypes.push(entry)
      else named.push(entry)
    }
    // remove named portion from left
    left = left.replace(/\{[\s\S]*?\}/, '').trim()
  }

  // process remaining: possible default and/or namespace
  if (left.length > 0) {
    const parts = left.split(',').map(s => s.trim()).filter(Boolean)
    for (const p of parts) {
      if (p.startsWith('* as '))
        namespaceName = p.slice(5).trim()
      else if (/^\w+$/.test(p))
        defaultName = p
    }
  }
  return { kind: 'value', source, defaultName, namespaceName, named, namedTypes, original: stmt }
}

// Sort known JSON files according to curated orders
function trySortKnownJson(input: string, filePath: string): string | null {
  if (RE_PACKAGE_JSON.test(filePath))
    return sortPackageJsonContent(input)
  if (RE_TSCONFIG_JSON.test(filePath))
    return sortTsconfigContent(input)
  return null
}

function parseJsonSafe(text: string): any | null {
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

function sortObjectKeys(obj: Record<string, any>, order: string[], extraAscPatterns: RegExp[] = []): Record<string, any> {
  const out: Record<string, any> = {}
  // place ordered keys first
  for (const k of order) {
    if (Object.prototype.hasOwnProperty.call(obj, k))
      out[k] = obj[k]
  }
  // then keys matching extra patterns in asc
  for (const rx of extraAscPatterns) {
    const keys = Object.keys(obj).filter(k => rx.test(k) && !(k in out)).sort()
    for (const k of keys)
      out[k] = obj[k]
  }
  // finally remaining keys asc
  const remaining = Object.keys(obj).filter(k => !(k in out)).sort()
  for (const k of remaining)
    out[k] = obj[k]
  return out
}

function sortDepsAsc(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of Object.keys(obj).sort())
    out[k] = obj[k]
  return out
}

function sortPackageJsonContent(text: string): string {
  const data = parseJsonSafe(text)
  if (!data || typeof data !== 'object')
    return text
  const topOrder = [
    'publisher',
    'name',
    'displayName',
    'type',
    'version',
    'private',
    'packageManager',
    'description',
    'author',
    'contributors',
    'license',
    'funding',
    'homepage',
    'repository',
    'bugs',
    'keywords',
    'categories',
    'sideEffects',
    'imports',
    'exports',
    'main',
    'module',
    'unpkg',
    'jsdelivr',
    'types',
    'typesVersions',
    'bin',
    'icon',
    'files',
    'engines',
    'activationEvents',
    'contributes',
    'scripts',
    'peerDependencies',
    'peerDependenciesMeta',
    'dependencies',
    'optionalDependencies',
    'devDependencies',
    'pnpm',
    'overrides',
    'resolutions',
    'husky',
    'simple-git-hooks',
    'lint-staged',
    'eslintConfig',
  ]
  const sortedTop = sortObjectKeys(data, topOrder)
  // sort files array asc
  if (Array.isArray(sortedTop.files)) {
    const allStrings = sortedTop.files.every((v: any) => typeof v === 'string')
    if (allStrings)
      sortedTop.files = [...sortedTop.files].sort()
  }
  // sort deps blocks A-Z
  for (const k of Object.keys(sortedTop)) {
    if (/^(?:dev|peer|optional|bundled)?[Dd]ependencies(?:Meta)?$/.test(k) || /^(?:resolutions|overrides|pnpm\.overrides)$/.test(k)) {
      if (sortedTop[k] && typeof sortedTop[k] === 'object')
        sortedTop[k] = sortDepsAsc(sortedTop[k])
    }
  }
  // pnpm.overrides nested
  if (sortedTop.pnpm && typeof sortedTop.pnpm === 'object' && sortedTop.pnpm.overrides && typeof sortedTop.pnpm.overrides === 'object')
    sortedTop.pnpm.overrides = sortDepsAsc(sortedTop.pnpm.overrides)
  // exports specific sub-key order
  if (sortedTop.exports && typeof sortedTop.exports === 'object') {
    const exp = sortedTop.exports
    const subOrder = ['types', 'import', 'require', 'default']
    if (!Array.isArray(exp)) {
      const out: Record<string, any> = {}
      for (const key of Object.keys(exp)) {
        const val = exp[key]
        if (val && typeof val === 'object' && !Array.isArray(val))
          out[key] = sortObjectKeys(val, subOrder)
        else out[key] = val
      }
      sortedTop.exports = out
    }
  }
  // git hooks order inside known containers
  const hookOrder = ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit', 'pre-rebase', 'post-rewrite', 'post-checkout', 'post-merge', 'pre-push', 'pre-auto-gc']
  for (const hk of ['gitHooks', 'husky', 'simple-git-hooks']) {
    if (sortedTop[hk] && typeof sortedTop[hk] === 'object')
      sortedTop[hk] = sortObjectKeys(sortedTop[hk], hookOrder)
  }
  return JSON.stringify(sortedTop, null, 2)
}

function sortTsconfigContent(text: string): string {
  const data = parseJsonSafe(text)
  if (!data || typeof data !== 'object')
    return text
  const topOrder = ['extends', 'compilerOptions', 'references', 'files', 'include', 'exclude']
  const outTop = sortObjectKeys(data, topOrder)
  if (outTop.compilerOptions && typeof outTop.compilerOptions === 'object') {
    const compilerOrder = [
      'incremental',
      'composite',
      'tsBuildInfoFile',
      'disableSourceOfProjectReferenceRedirect',
      'disableSolutionSearching',
      'disableReferencedProjectLoad',
      'target',
      'jsx',
      'jsxFactory',
      'jsxFragmentFactory',
      'jsxImportSource',
      'lib',
      'moduleDetection',
      'noLib',
      'reactNamespace',
      'useDefineForClassFields',
      'emitDecoratorMetadata',
      'experimentalDecorators',
      'libReplacement',
      'baseUrl',
      'rootDir',
      'rootDirs',
      'customConditions',
      'module',
      'moduleResolution',
      'moduleSuffixes',
      'noResolve',
      'paths',
      'resolveJsonModule',
      'resolvePackageJsonExports',
      'resolvePackageJsonImports',
      'typeRoots',
      'types',
      'allowArbitraryExtensions',
      'allowImportingTsExtensions',
      'allowUmdGlobalAccess',
      'allowJs',
      'checkJs',
      'maxNodeModuleJsDepth',
      'strict',
      'strictBindCallApply',
      'strictFunctionTypes',
      'strictNullChecks',
      'strictPropertyInitialization',
      'allowUnreachableCode',
      'allowUnusedLabels',
      'alwaysStrict',
      'exactOptionalPropertyTypes',
      'noFallthroughCasesInSwitch',
      'noImplicitAny',
      'noImplicitOverride',
      'noImplicitReturns',
      'noImplicitThis',
      'noPropertyAccessFromIndexSignature',
      'noUncheckedIndexedAccess',
      'noUnusedLocals',
      'noUnusedParameters',
      'useUnknownInCatchVariables',
      'declaration',
      'declarationDir',
      'declarationMap',
      'downlevelIteration',
      'emitBOM',
      'emitDeclarationOnly',
      'importHelpers',
      'importsNotUsedAsValues',
      'inlineSourceMap',
      'inlineSources',
      'mapRoot',
      'newLine',
      'noEmit',
      'noEmitHelpers',
      'noEmitOnError',
      'outDir',
      'outFile',
      'preserveConstEnums',
      'preserveValueImports',
      'removeComments',
      'sourceMap',
      'sourceRoot',
      'stripInternal',
      'allowSyntheticDefaultImports',
      'esModuleInterop',
      'forceConsistentCasingInFileNames',
      'isolatedDeclarations',
      'isolatedModules',
      'preserveSymlinks',
      'verbatimModuleSyntax',
      'erasableSyntaxOnly',
      'skipDefaultLibCheck',
      'skipLibCheck',
    ]
    outTop.compilerOptions = sortObjectKeys(outTop.compilerOptions, compilerOrder)
  }
  return JSON.stringify(outTop, null, 2)
}
