import type { PickierConfig } from './types'

const CODE_EXTS = new Set(['.ts', '.js'])
const JSON_EXTS = new Set(['.json', '.jsonc'])
const YAML_EXTS = new Set(['.yaml', '.yml'])

// Pre-compiled regex patterns for the hot loop (avoids re-creation per line)
const RE_LEADING_WS = /^[ \t]*/
const RE_CLOSING_BRACE = /^\}/
const RE_OPENING_BRACE = /\{\s*$/
const RE_FOR_LOOP = /^\s*for\s*\(/
const RE_EMPTY_SEMI = /^\s*;\s*$/
const RE_DUP_SEMI = /;{2,}\s*$/
const RE_SPACE_BEFORE_BRACE = /(\S)\{/g
const RE_SPACE_AFTER_BRACE_KW = /\{(return|if|for|while|switch|const|let|var|function)\b/g
const RE_COMMA_SPACE = /,(\S)/g
const RE_EQUALS_SPACE = /(?<![=!<>])=(?![=><])/g
const RE_PLUS_OP = /(\w)\+(\w)/g
const RE_MINUS_OP = /(\w)-(\w)/g
const RE_STAR_OP = /(\w)\*(\w)/g
const RE_SLASH_OP = /(\w)\/(\w)/g
const RE_SEMI_SPACE = /;([^\s;])/g
const RE_LT_OP = /([\w\])])<(\S)/g
const RE_GT_OP = /(\S)>([\w[(])/g
const RE_MULTI_SPACE = /\s{2,}/g
const RE_BLANK_LINE = /^\s*$/
const RE_LINE_COMMENT = /^\s*\/\//
const RE_BLOCK_COMMENT = /^\s*\/\*/
const RE_IMPORT_STMT = /^\s*import\b/
const RE_PACKAGE_JSON = /package\.json$/i
const RE_TSCONFIG_JSON = /[jt]sconfig(?:\..+)?\.json$/i
const RE_TRAILING_WS = /[ \t]+$/
const RE_LEADING_BLANKS = /^(?:[ \t]*\n)+/

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
  // Strategy: swap quote types for cleaner output
  // Unescape escaped double quotes: \"  → "
  // Swap single quotes to double quotes: ' → " (since they're literals in the string)
  let result = inner.replace(/\\"/g, '"') // unescape \"
  result = result.replace(/'/g, '"') // swap ' to "
  return `'${result}'`
}

function convertSingleToDouble(str: string): string {
  const inner = str.slice(1, -1)
  // Unescape escaped single quotes: \'  → '
  // Swap double quotes to single quotes: " → '
  let result = inner.replace(/\\'/g, '\'')
  result = result.replace(/"/g, '\'')
  return `"${result}"`
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
      if (ch === '\\') { i += 2; continue }
      if (ch === '`') inString = 0
      i++
    }
    else {
      // single or double string
      if (ch === '\\') { i += 2; continue }
      const closeChar = inString === 1 ? '\'' : '"'
      if (ch === closeChar) {
        // Found closing quote — convert if needed
        const needConvert = (inString === 2 && wantSingle) || (inString === 1 && !wantSingle)
        if (needConvert) {
          // Flush segment before string
          if (stringStart > segStart)
            parts.push(line.slice(segStart, stringStart))
          const stringContent = line.slice(stringStart + 1, i)
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

  for (let idx = 0; idx < len; idx++) {
    let line = lines[idx]

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

    line = makeIndent(indentLevel, cfg) + trimmed

    if (RE_OPENING_BRACE.test(trimmed))
      indentLevel += 1

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

    result[idx] = line
  }

  return result.join('\n')
}

function collapseBlankLines(lines: string[], maxConsecutive: number): string[] {
  const out: string[] = []
  let blank = 0
  for (const l of lines) {
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

    for (const l of rawLines) {
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

  // FUSED: quotes + indentation + spacing + semicolons in ONE split/join pass
  if (isCodeFileExt(filePath)) {
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
      if (ch === '\'') {
        if (preferred === 'double') {
          // Single quote when double is preferred
          const beforeSlash = line.lastIndexOf('//', i)
          if (beforeSlash === -1 || beforeSlash > i) {
            indices.push(i)
          }
        }
        inString = 'single'
        continue
      }
      else if (ch === '"') {
        if (preferred === 'single') {
          // Double quote when single is preferred
          const beforeSlash = line.lastIndexOf('//', i)
          if (beforeSlash === -1 || beforeSlash > i) {
            indices.push(i)
          }
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

function maskStrings(input: string): { text: string, strings: string[] } {
  // Fast path: no quotes at all — skip character scan
  if (!input.includes('\'') && !input.includes('"') && !input.includes('`'))
    return { text: input, strings: [] }

  const strings: string[] = []
  const parts: string[] = []
  let i = 0
  let segStart = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\'' || ch === '"' || ch === '`') {
      // Flush non-string segment
      if (i > segStart)
        parts.push(input.slice(segStart, i))
      const start = i
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

export function formatImports(source: string): string {
  // Fast path: if file doesn't start with import/comment/blank, no import block to process
  const firstChar = source[0]
  if (firstChar !== 'i' && firstChar !== ' ' && firstChar !== '\t' && firstChar !== '/' && firstChar !== '\n')
    return source

  const lines = source.split('\n')
  const imports: ParsedImport[] = []
  let idx = 0
  // capture contiguous import block at top allowing comments and blank lines
  while (idx < lines.length) {
    const line = lines[idx]
    if (RE_BLANK_LINE.test(line) || RE_LINE_COMMENT.test(line) || RE_BLOCK_COMMENT.test(line)) {
      idx++
      continue
    }
    if (!RE_IMPORT_STMT.test(line))
      break
    const stmt = line.trim()
    const parsed = parseImportStatement(stmt)
    if (parsed)
      imports.push(parsed)
    idx++
  }
  if (imports.length === 0)
    return source

  const rest = lines.slice(idx).join('\n')

  // Remove unused only for simple named (no alias). Keep defaults, namespaces, and all type specifiers.
  const codeText = rest
  const isWordChar = (c: string) => c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c === '_' || c === '$'
  const used = (name: string): boolean => {
    let pos = 0
    while ((pos = codeText.indexOf(name, pos)) !== -1) {
      const before = pos > 0 ? codeText[pos - 1] : ' '
      const after = pos + name.length < codeText.length ? codeText[pos + name.length] : ' '
      if (!isWordChar(before) && !isWordChar(after))
        return true
      pos += name.length
    }
    return false
  }
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

  // If no imports remain after filtering, return the rest without import block
  if (entries.length === 0) {
    // Remove leading newlines from rest for consistency
    return rest.replace(/^\n+/, '')
  }

  const rendered = entries.map(renderImport).join('\n')
  // ensure a trailing blank line after imports if there is following code
  const sep = rest.length > 0 && !rest.startsWith('\n') ? '\n\n' : '\n'
  return `${rendered}${sep}${rest.replace(/^\n+/, '')}`
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
  const fromMatch = stmt.match(/\sfrom\s+['"]([^'"]+)['"]\s*;?$/)
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
