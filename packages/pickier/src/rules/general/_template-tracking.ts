/**
 * Compute, for each line of a TS/JS source, whether the line begins inside
 * a template-literal body (i.e. between an unclosed backtick and its
 * matching close).
 *
 * Used by rules like `prefer-const` and `pickier/no-unused-vars` to skip
 * generated code embedded in template strings — declarations and function
 * bodies inside a `\`<script>...\`` blob aren't real top-level code, and
 * applying lint rules to them produces false positives that fixers will
 * happily turn into broken runtime code.
 *
 * Tracks: single-quoted strings, double-quoted strings, template-literal
 * bodies + their `${}` expressions (with brace depth), regex literals
 * (with character-class awareness), line and block comments.
 *
 * Regex-vs-division disambiguation uses the previous "significant"
 * character on the logical statement: `/` after operators / punctuation
 * starts a regex; `/` after an identifier or closing bracket is division.
 */
export function computeLineStartsInTemplate(text: string): boolean[] {
  const lines = text.split(/\r?\n/)
  const out: boolean[] = new Array(lines.length).fill(false)
  const tmplStack: number[] = [] // -1 = template body; n>=0 = ${} expr with brace depth n
  let inSingle = false
  let inDouble = false
  let inRegex = false
  let inBlockComment = false
  let escaped = false
  let prevSig = ''
  const isRegexStart = (): boolean => {
    if (prevSig === '') return true
    return '=([{,;!&|?:+-*/%^~<>'.includes(prevSig)
  }
  for (let li = 0; li < lines.length; li++) {
    out[li] = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === -1
    const s = lines[li]
    for (let k = 0; k < s.length; k++) {
      const ch = s[k]
      if (inBlockComment) {
        if (ch === '*' && k + 1 < s.length && s[k + 1] === '/') {
          inBlockComment = false
          k++
        }
        continue
      }
      if (escaped) {
        escaped = false
        continue
      }
      const inBody = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === -1
      const inExpr = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] >= 0
      if (ch === '\\' && (inSingle || inDouble || inRegex || inBody)) {
        escaped = true
        continue
      }
      if (inSingle) { if (ch === '\'') inSingle = false; continue }
      if (inDouble) { if (ch === '"') inDouble = false; continue }
      if (inRegex) {
        if (ch === '[') {
          let depth = 1
          let kk = k + 1
          while (kk < s.length) {
            const cc = s[kk]
            if (cc === '\\') { kk += 2; continue }
            if (cc === ']') { depth--; if (depth === 0) break }
            kk++
          }
          k = kk
          continue
        }
        if (ch === '/') {
          inRegex = false
          while (k + 1 < s.length && /[gimsuvy]/.test(s[k + 1])) k++
        }
        continue
      }
      if (inBody) {
        if (ch === '`') {
          tmplStack.pop()
        }
        else if (ch === '$' && k + 1 < s.length && s[k + 1] === '{') {
          // Push a NEW expr frame so the body frame underneath is preserved.
          tmplStack.push(0)
          k++
        }
        continue
      }
      // Top-level OR ${} expr context — handle comments, strings, regex.
      if (ch === '/' && k + 1 < s.length && s[k + 1] === '/') break
      if (ch === '/' && k + 1 < s.length && s[k + 1] === '*') {
        inBlockComment = true
        k++
        continue
      }
      if (inExpr) {
        if (ch === '`') { tmplStack.push(-1); prevSig = '' }
        else if (ch === '\'') { inSingle = true; prevSig = '\'' }
        else if (ch === '"') { inDouble = true; prevSig = '"' }
        else if (ch === '{') { tmplStack[tmplStack.length - 1]++; prevSig = '{' }
        else if (ch === '}') {
          const cur = tmplStack[tmplStack.length - 1]
          if (cur > 0) tmplStack[tmplStack.length - 1] = cur - 1
          else tmplStack.pop()
          prevSig = '}'
        }
        else if (ch === '/' && isRegexStart()) inRegex = true
        else if (!/\s/.test(ch)) prevSig = ch
        continue
      }
      // Outside template (top-level code)
      if (ch === '`') { tmplStack.push(-1); prevSig = '' }
      else if (ch === '\'') { inSingle = true; prevSig = '\'' }
      else if (ch === '"') { inDouble = true; prevSig = '"' }
      else if (ch === '/' && isRegexStart()) inRegex = true
      else if (!/\s/.test(ch)) prevSig = ch
    }
  }
  return out
}

/**
 * On a single line, return [start, end] ranges of characters that fall
 * inside a backtick-bounded template literal. If a backtick opens but
 * doesn't close on this line, the range extends to the line's end (it's
 * the first line of a multi-line template).
 *
 * Used by per-line fixers to refuse to rewrite identifiers that fall
 * inside an embedded code blob whose other usages live in the same
 * template string and aren't visible to the syntactic rename.
 */
export function backtickRangesOnLine(line: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let inS = false
  let inD = false
  let esc = false
  let openTick = -1
  for (let k = 0; k < line.length; k++) {
    const ch = line[k]
    if (esc) { esc = false; continue }
    if (ch === '\\' && (inS || inD || openTick >= 0)) { esc = true; continue }
    if (openTick >= 0) {
      if (ch === '`') {
        out.push([openTick, k])
        openTick = -1
      }
      continue
    }
    if (inS) { if (ch === '\'') inS = false; continue }
    if (inD) { if (ch === '"') inD = false; continue }
    if (ch === '`') openTick = k
    else if (ch === '\'') inS = true
    else if (ch === '"') inD = true
  }
  if (openTick >= 0)
    out.push([openTick, line.length])
  return out
}
