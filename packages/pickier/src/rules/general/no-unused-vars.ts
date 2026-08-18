/* eslint-disable regexp/no-super-linear-backtracking */
import type { RuleModule } from '../../types'

/**
 * Characters that mean a `{` continues a type annotation rather than opening a
 * function body: the members of a union or intersection, the start of an
 * annotation, a separator inside one, and the opening of a generic's argument
 * list.
 */
const TYPE_CONTINUATION = new Set(['|', '&', ':', ',', '<'])

/**
 * Blank out the prose inside comments, keeping every offset where it was.
 *
 * This rule finds declarations and their uses with a dozen small hand-written
 * scanners, and each one tracks whether it is inside a string by watching for
 * a quote character. None of them knew about comments, so an apostrophe in
 * English prose opened a string that nothing ever closed:
 *
 *     const markup = createWriter()
 *     \/** The document's raw HTML. *\/
 *     const prose = (c) => markup.write(c, t => linkify(t, context))
 *
 * Everything after `document'` read as string content, the uses of `context`
 * and of the parameters below it were never seen, and the rule reported them
 * as unused - on a file that compiles and runs. Worse, the autofix then offers
 * to rename them to `_name` while the body still says `name`.
 *
 * Only the *contents* are blanked, and only with spaces. The `/*`, `*\/` and
 * `//` delimiters stay, so the scanners that look for them still work; the
 * length and the line breaks are unchanged, so every reported column still
 * points where it did; and a name that appears only in a comment is now
 * correctly not a use, which is what the rule meant all along.
 *
 * Regex literals are tracked for the same reason strings are. A pattern that
 * ends in an escaped slash closes with `\/` immediately followed by the real
 * delimiter, and a scanner that does not know it is inside a regex reads that
 * pair as the start of a line comment:
 *
 *     return /^https?:\/\//.test(baseUrl) ? baseUrl : `https://${baseUrl}`
 *
 * Everything from `//` onwards was blanked, all three uses of `baseUrl`
 * disappeared, and the rule called a working parameter unused — then the
 * autofix renamed it to `_baseUrl` and left the body referencing `baseUrl`,
 * turning a false positive into a runtime error.
 */
/**
 * Tokens after which a `/` opens a regex literal rather than dividing.
 *
 * Division only follows a value: an identifier, a literal, or a closing
 * bracket. Everything else is an expression position, so `/` starts a pattern.
 */
const REGEX_PRECEDING = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])

/** Keywords a regex may directly follow, where the previous char is a letter. */
const REGEX_KEYWORDS = ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await']

/**
 * Whether the `/` at `at` begins a regex literal.
 *
 * Looks back past whitespace to the last significant character. A letter or
 * digit there usually means division, unless it terminates one of the keywords
 * above.
 */
function startsRegex(text: string, at: number): boolean {
  let back = at - 1
  while (back >= 0 && /\s/.test(text[back]!))
    back -= 1

  if (back < 0)
    return true

  const previous = text[back]!
  if (REGEX_PRECEDING.has(previous))
    return true

  if (/[\w$)\]]/.test(previous)) {
    // `)`/`]`/identifier/number is a value, so `/` divides — except after a
    // keyword, where it opens a pattern.
    if (/[\w$]/.test(previous)) {
      let start = back
      while (start >= 0 && /[\w$]/.test(text[start]!))
        start -= 1

      const word = text.slice(start + 1, back + 1)
      return REGEX_KEYWORDS.includes(word)
    }

    return false
  }

  return true
}

/**
 * Whether a `/` at `at` in `text` can open a regex, for the line scanners below.
 *
 * Looser than {@link startsRegex}, and deliberately kept that way: these
 * scanners are string-and-brace counters rather than parsers, and widening what
 * they treat as a pattern makes them misread ordinary code (a `/` after a
 * backtick is a closing delimiter, not an opening one). This adds the single
 * position they all missed — after an arrow.
 *
 * `line => /^…/.test(line)` is the commonest place a regex appears in this
 * codebase, and none of them recognised it. A pattern left unstripped is read
 * as code, so a quote inside a character class (`/["']/`) opened a string that
 * ran to the end of the line and swallowed every identifier after it: the rule
 * then called a used parameter unused, and `--fix` renamed it, turning the
 * false positive into a runtime error.
 */
function scannerStartsRegex(text: string, at: number): boolean {
  // A comment can follow anything a regex can, so it is ruled out first.
  if (text[at + 1] === '/' || text[at + 1] === '*')
    return false

  const before = text.slice(0, at).trimEnd()

  return !before
    || /[=([{,:;!&|?]$/.test(before)
    || before.endsWith('=>')
    || before.endsWith('return')
}

export function maskCommentText(text: string): string {
  const out = text.split('')
  let index = 0
  let inString: '\'' | '"' | null = null
  let escaped = false

  /*
   * Template literals nest, and nothing else here does.
   *
   * ``  `'${value.replace(/'/g, `'\\''`)}'`  `` is one template inside
   * another template's `${}`, which is ordinary in any code that quotes
   * quotes - a shell-quoting helper is where it turns up first. Tracked with a
   * single "am I in a string" flag, the inner backtick closes the *outer*
   * template, every quote after it flips the state the wrong way, and the
   * desync runs to the end of the file: a `//` inside a later template gets
   * blanked as a comment, and the identifiers on that line disappear. The rule
   * then calls a used parameter unused, and `--fix` renames it while the body
   * keeps saying the old name.
   *
   * So a stack: `-1` is a template body, and a number is a `${}` expression
   * holding its own brace depth. Inside a body only the backtick and `${`
   * matter - a quote, a slash, a `//` are all literal text. Inside an
   * expression everything behaves as it does at the top level, including
   * another template.
   */
  const frames: number[] = []
  const body = (): boolean => frames.length > 0 && frames[frames.length - 1] === -1
  const expression = (): boolean => frames.length > 0 && frames[frames.length - 1]! >= 0

  const blank = (from: number, to: number): void => {
    for (let at = from; at < to && at < out.length; at += 1) {
      if (out[at] !== '\n' && out[at] !== '\r')
        out[at] = ' '
    }
  }

  while (index < text.length) {
    const character = text[index]!

    if (inString) {
      if (escaped)
        escaped = false
      else if (character === '\\')
        escaped = true
      else if (character === inString)
        inString = null
      // A newline ends a quoted string whatever else is happening: an
      // apostrophe in prose must not swallow the rest of the file here either.
      else if (character === '\n')
        inString = null

      index += 1
      continue
    }

    if (body()) {
      if (escaped) {
        escaped = false
      }
      else if (character === '\\') {
        escaped = true
      }
      else if (character === '`') {
        frames.pop()
      }
      else if (character === '$' && text[index + 1] === '{') {
        // A new frame rather than a flag on this one: the body underneath has
        // to survive, or the closing brace pops out of the template entirely.
        frames.push(0)
        index += 1
      }

      index += 1
      continue
    }

    if (character === '`') {
      frames.push(-1)
      index += 1
      continue
    }

    if (expression()) {
      if (character === '{') {
        frames[frames.length - 1]! += 1
        index += 1
        continue
      }

      if (character === '}') {
        const depth = frames[frames.length - 1]!

        if (depth > 0)
          frames[frames.length - 1] = depth - 1
        else
          frames.pop()

        index += 1
        continue
      }
    }

    if (character === '\'' || character === '"') {
      inString = character
      index += 1
      continue
    }

    // A regex literal is skipped whole, so an escaped slash inside it can
    // never be mistaken for a comment delimiter. Nothing is blanked: the
    // pattern is code, and a name inside it is not a use anyway.
    if (character === '/' && text[index + 1] !== '/' && text[index + 1] !== '*' && startsRegex(text, index)) {
      let at = index + 1
      let inClass = false
      let regexEscaped = false

      while (at < text.length) {
        const current = text[at]!

        if (regexEscaped)
          regexEscaped = false
        else if (current === '\\')
          regexEscaped = true
        else if (current === '[')
          inClass = true
        else if (current === ']')
          inClass = false
        // An unterminated pattern must not swallow the rest of the file.
        else if (current === '\n')
          break
        else if (current === '/' && !inClass) {
          at += 1
          break
        }

        at += 1
      }

      index = at
      continue
    }

    if (character === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index)
      blank(index + 2, end < 0 ? text.length : end)
      index = end < 0 ? text.length : end
      continue
    }

    if (character === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      blank(index + 2, end < 0 ? text.length : end)
      index = end < 0 ? text.length : end + 2
      continue
    }

    index += 1
  }

  return out.join('')
}

export const noUnusedVarsRule: RuleModule = {
  meta: { docs: 'Report variables and parameters that are declared/assigned but never used' },
  check: (text, ctx) => {
    // Skip this rule's own source file to avoid self-referential complexity
    if (ctx.filePath.endsWith('/no-unused-vars.ts')) {
      return []
    }

    // Ambient declaration files declare globals that aren't necessarily
    // referenced in the same file — that's the whole point of `.d.ts`.
    // Skip the unused-vars heuristic for them.
    if (ctx.filePath.endsWith('.d.ts')) {
      return []
    }

    const issues: ReturnType<RuleModule['check']> = []
    const opts: any = ctx.options || {}
    const varsIgnorePattern = typeof opts.varsIgnorePattern === 'string' ? opts.varsIgnorePattern : '^_'
    const argsIgnorePattern = typeof opts.argsIgnorePattern === 'string' ? opts.argsIgnorePattern : '^_'
    const varIgnoreRe = new RegExp(varsIgnorePattern, 'u')
    const argIgnoreRe = new RegExp(argsIgnorePattern, 'u')

    // Comments are blanked before anything reads the file. Every scanner below
    // tracks strings by watching for a quote, and an apostrophe in English
    // prose is a quote - see `maskCommentText`. Offsets and line breaks are
    // preserved, so reported positions are unaffected.
    const code = maskCommentText(text)
    const lines = code.split(/\r?\n/)
    const full = code

    // Pre-compute which lines start inside a multi-line template literal body.
    // Used to skip analysis of generated code inside template content in both loops.
    const lineStartsInTemplate: boolean[] = new Array(lines.length).fill(false)
    const computeTemplateLines = () => {
      const tmplStack: number[] = [] // -1 = in template body, >= 0 = in ${} expr (frame's own brace depth)
      let tInSingle = false
      let tInDouble = false
      let tInRegex = false
      let tInBlockComment = false
      let tEscaped = false
      // Track the previous non-whitespace, non-comment character on the
      // current logical statement so we can decide whether `/` starts a
      // regex literal (after operators/keywords/`,`/`(`/etc.) or is a
      // division operator (after an identifier/literal/`)`/`]`).
      let prevSig = ''
      const isRegexStart = (): boolean => {
        if (prevSig === '') return true
        // Operators and punctuation that imply an expression follows.
        if ('=([{,;!&|?:+-*/%^~<>'.includes(prevSig)) return true
        return false
      }
      for (let li = 0; li < lines.length; li++) {
        lineStartsInTemplate[li] = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === -1
        const s = lines[li]
        for (let k = 0; k < s.length; k++) {
          const ch = s[k]
          // Multi-line /* ... */ takes precedence over everything else
          // (including string and template state) — these comments can
          // span lines and contain any characters.
          if (tInBlockComment) {
            if (ch === '*' && k + 1 < s.length && s[k + 1] === '/') {
              tInBlockComment = false
              k++
            }
            continue
          }
          if (tEscaped) {
            tEscaped = false
            continue
          }
          const inBody = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === -1
          const inExpr = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] >= 0
          if (ch === '\\' && (tInSingle || tInDouble || tInRegex || inBody)) {
            tEscaped = true
            continue
          }
          if (tInSingle) {
            if (ch === '\'') tInSingle = false
            continue
          }
          if (tInDouble) {
            if (ch === '"') tInDouble = false
            continue
          }
          if (tInRegex) {
            if (ch === '[') {
              let depth = 1
              let kk = k + 1
              while (kk < s.length) {
                const cc = s[kk]
                if (cc === '\\') {
                  kk += 2
                  continue
                }
                if (cc === ']') {
                  depth--
                  if (depth === 0) break
                }
                kk++
              }
              k = kk
              continue
            }
            if (ch === '/') {
              tInRegex = false
              while (k + 1 < s.length && /[gimsuvy]/.test(s[k + 1])) k++
            }
            continue
          }
          if (inBody) {
            if (ch === '`') {
              tmplStack.pop()
            }
            else if (ch === '$' && k + 1 < s.length && s[k + 1] === '{') {
              // Push a NEW expr frame so the body frame underneath is
              // preserved. Mutating the body frame loses context and the
              // closing `}` would pop us out of the template entirely.
              tmplStack.push(0)
              k++
            }
            continue
          }
          // Top-level OR ${} expr context — handle comments, strings, regex.
          if (ch === '/' && k + 1 < s.length && s[k + 1] === '/') break
          if (ch === '/' && k + 1 < s.length && s[k + 1] === '*') {
            tInBlockComment = true
            k++
            continue
          }
          if (inExpr) {
            if (ch === '`') {
              tmplStack.push(-1)
              prevSig = ''
            }
            else if (ch === '\'') {
              tInSingle = true
              prevSig = '\''
            }
            else if (ch === '"') {
              tInDouble = true
              prevSig = '"'
            }
            else if (ch === '{') {
              tmplStack[tmplStack.length - 1]++
              prevSig = '{'
            }
            else if (ch === '}') {
              const cur = tmplStack[tmplStack.length - 1]
              if (cur > 0) tmplStack[tmplStack.length - 1] = cur - 1
              else tmplStack.pop()
              prevSig = '}'
            }
            else if (ch === '/' && isRegexStart()) {
              tInRegex = true
            }
            else if (!/\s/.test(ch)) {
              prevSig = ch
            }
            continue
          }
          // Outside template (top-level code)
          if (ch === '`') {
            tmplStack.push(-1)
            prevSig = ''
          }
          else if (ch === '\'') {
            tInSingle = true
            prevSig = '\''
          }
          else if (ch === '"') {
            tInDouble = true
            prevSig = '"'
          }
          else if (ch === '/' && isRegexStart()) {
            tInRegex = true
          }
          else if (!/\s/.test(ch)) {
            prevSig = ch
          }
        }
      }
    }
    computeTemplateLines()

    const declRe = new RegExp('^\\s*(?:const|let|var)\\s+(.+?)' + ';' + '?\\s*$')
    for (let i = 0; i < lines.length; i++) {
      // Skip lines inside template literal body (generated code, not real code)
      if (lineStartsInTemplate[i])
        continue
      const line = lines[i]
      const decl = line.match(declRe)
      if (!decl)
        continue
      const after = decl[1]

      // Smart comma split: ignore commas inside < >, [ ], { }, ( ), and strings
      const parts: string[] = []
      let current = ''
      let depth = 0
      let angleDepth = 0
      let inString: 'single' | 'double' | 'template' | null = null
      let escaped = false
      for (let k = 0; k < after.length; k++) {
        const ch = after[k]

        // Handle escape sequences in strings
        if (escaped) {
          escaped = false
          current += ch
          continue
        }

        if (ch === '\\' && inString) {
          escaped = true
          current += ch
          continue
        }

        // Track string boundaries
        if (!inString) {
          // Stop at a trailing line comment, and skip inline block comments —
          // their text (and any commas in it) must not be read as declarators.
          // `//` inside a string is handled by the `inString` branch below, so
          // URLs like 'http://…' are safe.
          if (ch === '/' && after[k + 1] === '/')
            break
          if (ch === '/' && after[k + 1] === '*') {
            k += 2
            while (k < after.length && !(after[k] === '*' && after[k + 1] === '/'))
              k++
            k++ // skip the closing '/'
            continue
          }
          if (ch === '\'') {
            inString = 'single'
          }
          else if (ch === '"') {
            inString = 'double'
          }
          else if (ch === '`') {
            inString = 'template'
          }
          else if (ch === '<') {
            angleDepth++
          }
          else if (ch === '>') {
            angleDepth--
          }
          else if (ch === '(' || ch === '[' || ch === '{') {
            depth++
          }
          else if (ch === ')' || ch === ']' || ch === '}') {
            depth--
          }
          else if (ch === ',' && depth === 0 && angleDepth === 0) {
            parts.push(current)
            current = ''
            continue
          }
        }
        else {
          // Inside string - check for end
          if ((inString === 'single' && ch === '\'')
            || (inString === 'double' && ch === '"')
            || (inString === 'template' && ch === '`')) {
            inString = null
          }
        }
        current += ch
      }
      if (current)
        parts.push(current)

      for (const partRaw of parts) {
        const part = partRaw.trim()
        if (!part)
          continue
        const simple = part.match(/^([$A-Z_][\w$]*)/i)
        const names: string[] = []
        if (simple) {
          names.push(simple[1])
        }
        else if (part.startsWith('{') || part.startsWith('[')) {
          // Find matching closing brace/bracket (not greedy)
          const openChar = part[0]
          const closeChar = openChar === '{' ? '}' : ']'
          let dDepth = 0
          let endIdx = -1
          let dStr: 'single' | 'double' | 'template' | null = null
          let dEsc = false
          for (let ci = 0; ci < part.length; ci++) {
            const ch = part[ci]
            if (dEsc) {
              dEsc = false
              continue
            }
            if (ch === '\\' && dStr) {
              dEsc = true
              continue
            }
            if (!dStr) {
              if (ch === '\'' || ch === '"' || ch === '`') {
                dStr = ch === '\'' ? 'single' : ch === '"' ? 'double' : 'template'
              }
              else if (ch === openChar) {
                dDepth++
              }
              else if (ch === closeChar) {
                dDepth--
                if (dDepth === 0) {
                  endIdx = ci
                  break
                }
              }
            }
            else {
              if ((dStr === 'single' && ch === '\'') || (dStr === 'double' && ch === '"') || (dStr === 'template' && ch === '`')) dStr = null
            }
          }
          if (endIdx > 0) {
            const inner = part.slice(1, endIdx)
            // Split inner content on commas at depth 0
            const fields: string[] = []
            let fCurrent = ''
            let fDepth = 0
            let fStr: 'single' | 'double' | 'template' | null = null
            let fEsc = false
            for (let ci = 0; ci < inner.length; ci++) {
              const ch = inner[ci]
              if (fEsc) {
                fEsc = false
                fCurrent += ch
                continue
              }
              if (ch === '\\' && fStr) {
                fEsc = true
                fCurrent += ch
                continue
              }
              if (!fStr) {
                if (ch === '\'' || ch === '"' || ch === '`') {
                  fStr = ch === '\'' ? 'single' : ch === '"' ? 'double' : 'template'
                  fCurrent += ch
                  continue
                }
                if (ch === '(' || ch === '{' || ch === '[') fDepth++
                if (ch === ')' || ch === '}' || ch === ']') fDepth--
                if (ch === ',' && fDepth === 0) {
                  fields.push(fCurrent.trim())
                  fCurrent = ''
                  continue
                }
              }
              else {
                if ((fStr === 'single' && ch === '\'') || (fStr === 'double' && ch === '"') || (fStr === 'template' && ch === '`')) fStr = null
              }
              fCurrent += ch
            }
            if (fCurrent.trim()) fields.push(fCurrent.trim())

            for (const field of fields) {
              // Handle rest elements: ...rest
              if (field.startsWith('...')) {
                const restName = field.slice(3).match(/^([$A-Z_][\w$]*)/i)
                if (restName) names.push(restName[1])
                continue
              }
              // Handle alias: key: value (only take the value as the variable name)
              // Be careful: nested destructuring { a: { b } } has colon too
              const colonIdx = field.indexOf(':')
              if (colonIdx !== -1) {
                let value = field.slice(colonIdx + 1).trim()
                // Strip default value (after = at depth 0)
                let eqDepth = 0
                for (let ci = 0; ci < value.length; ci++) {
                  const ch = value[ci]
                  if (ch === '(' || ch === '{' || ch === '[') eqDepth++
                  else if (ch === ')' || ch === '}' || ch === ']') eqDepth--
                  else if (ch === '=' && eqDepth === 0) {
                    value = value.slice(0, ci).trim()
                    break
                  }
                }
                const nameMatch = value.match(/^([$A-Z_][\w$]*)/i)
                if (nameMatch) names.push(nameMatch[1])
              }
else {
                // Simple field: name or name = default
                let fieldName = field
                // Strip default value
                let eqDepth = 0
                for (let ci = 0; ci < fieldName.length; ci++) {
                  const ch = fieldName[ci]
                  if (ch === '(' || ch === '{' || ch === '[') eqDepth++
                  else if (ch === ')' || ch === '}' || ch === ']') eqDepth--
                  else if (ch === '=' && eqDepth === 0) {
                    fieldName = fieldName.slice(0, ci).trim()
                    break
                  }
                }
                const nameMatch = fieldName.match(/^([$A-Z_][\w$]*)/i)
                if (nameMatch) names.push(nameMatch[1])
              }
            }
          }
        }
        for (const name of names) {
          if (varIgnoreRe.test(name))
            continue
          // The whole file except this line, not just what follows it.
          //
          // It used to look forwards only, so a `const` declared at the bottom
          // of a module and used by a function above it read as unused - which
          // is a perfectly ordinary way to write a file, and the autofix for it
          // renames the declaration and leaves the use pointing at nothing.
          const elsewhere = `${lines.slice(0, i).join('\n')}\n${lines.slice(i + 1).join('\n')}`
          const refRe = new RegExp(`\\b${name}\\b`, 'g')
          if (!refRe.test(elsewhere)) {
            issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is assigned a value but never used. Allowed unused vars must match pattern: ${varsIgnorePattern}`, severity: 'error', help: `Either use this variable in your code, remove it, or prefix it with an underscore (_${name}) to mark it as intentionally unused` })
          }
        }
      }
    }

    // Function parameters: function foo(a,b) { ... } | const f = (a,b)=>{...} | const f=(x)=>x
    const getParamNames = (raw: string): string[] => {
      // First, strip default values (everything after = including strings, objects, etc.)
      // Need to find the = and strip everything after it while being aware of strings
      const stripDefaults = (s: string): string => {
        let result = ''
        let inStr: 'single' | 'double' | 'template' | null = null
        let escaped = false
        let depth = 0 // for (), {}, []

        for (let i = 0; i < s.length; i++) {
          const ch = s[i]

          if (escaped) {
            escaped = false
            continue
          }

          if (ch === '\\' && inStr) {
            escaped = true
            continue
          }

          if (!inStr) {
            if (ch === '\'') {
              inStr = 'single'
            }
            else if (ch === '"') {
              inStr = 'double'
            }
            else if (ch === '`') {
              inStr = 'template'
            }
            else if (ch === '(' || ch === '{' || ch === '[') {
              depth++
            }
            else if (ch === ')' || ch === '}' || ch === ']') {
              depth--
            }
            else if (ch === '=' && depth === 0) {
              // Found assignment, strip everything from here
              return result
            }
          }
          else {
            if ((inStr === 'single' && ch === '\'')
              || (inStr === 'double' && ch === '"')
              || (inStr === 'template' && ch === '`')) {
              inStr = null
            }
          }

          result += ch
        }
        return result
      }

      const withoutDefaults = stripDefaults(raw)

      // Strip TypeScript type annotations while respecting nested structures
      // Example: 'data: Array<{ line: number, message: string }>' -> 'data'
      const stripTypes = (s: string): string => {
        let result = ''
        let i = 0
        while (i < s.length) {
          const ch = s[i]

          // Found a type annotation
          if (ch === ':') {
            // Skip the colon and whitespace
            i++
            while (i < s.length && /\s/.test(s[i])) i++

            // Skip the type annotation by tracking bracket/angle depth
            let depth = 0
            let angleDepth = 0
            let inStr: 'single' | 'double' | 'template' | null = null
            let escaped = false

            while (i < s.length) {
              const c = s[i]

              if (escaped) {
                escaped = false
                i++
                continue
              }

              if (c === '\\' && inStr) {
                escaped = true
                i++
                continue
              }

              if (!inStr) {
                if (c === '\'') {
                  inStr = 'single'
                }
                else if (c === '"') {
                  inStr = 'double'
                }
                else if (c === '`') {
                  inStr = 'template'
                }
                else if (c === '<') {
                  angleDepth++
                }
                else if (c === '>') {
                  angleDepth--
                }
                else if (c === '(' || c === '{' || c === '[') {
                  depth++
                }
                else if (c === ')' || c === '}' || c === ']') {
                  if (depth > 0)
                    depth--
                  else break // End of parameter list
                }
                else if (c === ',' && depth === 0 && angleDepth === 0) {
                  // Found comma at top level - end of this parameter's type
                  break
                }
              }
              else {
                if ((inStr === 'single' && c === '\'')
                  || (inStr === 'double' && c === '"')
                  || (inStr === 'template' && c === '`')) {
                  inStr = null
                }
              }

              i++
            }
            continue
          }

          result += ch
          i++
        }
        return result
      }

      const cleaned = stripTypes(withoutDefaults)
      return cleaned.split(/[^$\w]+/).filter(name => name && name !== 'undefined')
    }
    const findBodyRange = (startLine: number, startColFrom?: number): { from: number, to: number } | null => {
      let openFound = false
      let depth = 0
      // Persistent state for multi-line return type annotation detection
      let bodyBraceDepth = 0
      let bodySawBracePair = false
      let bodyAngleDepth = 0
      let bodyInStr: 'single' | 'double' | 'template' | null = null
      let bodyEsc = false
      let isFirstSearchLine = true
      let lastNonWhitespaceBeforeBrace = '' // Tracks char before first '{' to detect object return types
      // Persistent string/template state for the depth-tracking second pass (must survive across lines)
      let depthInSingle = false
      let depthInDouble = false
      const depthTmplStack: number[] = [] // -1 = in template body, >= 0 = in ${} expr with that brace depth
      let depthEscaped = false
      for (let ln = startLine; ln < lines.length; ln++) {
        const s = lines[ln]

        // Strip comments from this line before processing.
        // Skip when inside a multi-line template body — `//` in template content
        // (e.g., URLs like https://) is literal text, not a JS comment.
        let lineToProcess = s
        const inMultiLineTmplBody = depthTmplStack.length > 0 && depthTmplStack[depthTmplStack.length - 1] === -1
        let commentIdx = -1
        let inStr: 'single' | 'double' | 'template' | null = null
        let esc = false
        if (!inMultiLineTmplBody)
        for (let i = 0; i < s.length - 1; i++) {
          const c = s[i]
          const next = s[i + 1]

          if (esc) {
            esc = false
            continue
          }
          if (c === '\\' && inStr) {
            esc = true
            continue
          }
          if (!inStr) {
            if (c === '\'') {
              inStr = 'single'
            }
            else if (c === '"') {
              inStr = 'double'
            }
            else if (c === '`') {
              inStr = 'template'
            }
            else if (c === '/' && next === '/') {
              commentIdx = i
              break
            }
          }
          else {
            if ((inStr === 'single' && c === '\'')
              || (inStr === 'double' && c === '"')
              || (inStr === 'template' && c === '`')) {
              inStr = null
            }
          }
        }
        if (commentIdx >= 0) {
          lineToProcess = s.slice(0, commentIdx)
        }

        // Also strip regex literals to avoid matching braces inside regex patterns
        const stripRegexFromLine = (str: string): string => {
          let result = ''
          let i = 0
          let inString: 'single' | 'double' | 'template' | null = null
          let escaped = false
          while (i < str.length) {
            const ch = str[i]
            if (escaped) {
              escaped = false
              result += ch
              i++
              continue
            }
            if (ch === '\\' && inString) {
              escaped = true
              result += ch
              i++
              continue
            }
            if (!inString) {
              if (ch === '\'') {
                inString = 'single'
              }
              else if (ch === '"') {
                inString = 'double'
              }
              else if (ch === '`') {
                inString = 'template'
              }
              else if (ch === '/') {
                if (scannerStartsRegex(str, i)) {
                  // This is a regex - skip it
                  i++ // skip opening /
                  while (i < str.length) {
                    if (str[i] === '\\') {
                      i += 2
                      continue
                    }
                    if (str[i] === '/') {
                      i++ // skip closing /
                      while (i < str.length && /[gimsuvy]/.test(str[i])) {
                        i++
                      }
                      break
                    }
                    i++
                  }
                  continue
                }
              }
            }
            else {
              if ((inString === 'single' && ch === '\'')
                || (inString === 'double' && ch === '"')
                || (inString === 'template' && ch === '`')) {
                inString = null
              }
            }
            result += ch
            i++
          }
          return result
        }
        if (!inMultiLineTmplBody)
          lineToProcess = stripRegexFromLine(lineToProcess)

        let startIdx = 0
        if (!openFound) {
          // Find function body '{' outside of strings and angle brackets
          // Handle return type annotations like ': { text: string }' by tracking brace pairs
          // State is persisted across lines to handle multi-line return types
          let foundIdx = -1
          let searchStart = isFirstSearchLine ? (typeof startColFrom === 'number' ? startColFrom : 0) : 0
          isFirstSearchLine = false
          // If searchStart is past lineToProcess (can happen when regex stripping shortens the line),
          // find => in the processed line and search from there instead
          if (searchStart >= lineToProcess.length) {
            const arrowInProcessed = lineToProcess.indexOf('=>')
            searchStart = arrowInProcessed >= 0 ? arrowInProcessed + 2 : 0
          }
          for (let i = searchStart; i < lineToProcess.length; i++) {
            const c = lineToProcess[i]
            if (bodyEsc) {
              bodyEsc = false
              continue
            }
            if (c === '\\' && bodyInStr) {
              bodyEsc = true
              continue
            }
            if (!bodyInStr) {
              // Track last non-whitespace char before first '{' at depth 0
              // Exclude '{' and '}' themselves so the tracker captures the char BEFORE a brace
              if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r' && c !== '{' && c !== '}' && bodyBraceDepth === 0) {
                lastNonWhitespaceBeforeBrace = c
              }
              if (c === '\'') {
                bodyInStr = 'single'
              }
              else if (c === '"') {
                bodyInStr = 'double'
              }
              else if (c === '`') {
                bodyInStr = 'template'
              }
              else if (c === '<') {
                bodyAngleDepth++
              }
              else if (c === '>') {
                bodyAngleDepth = Math.max(0, bodyAngleDepth - 1)
              }
              else if (c === '{') {
                // Track braces even inside angle brackets for return type annotations
                if (bodyBraceDepth === 0) {
                  // Found a '{' at depth 0
                  //
                  // Having seen one brace pair is not enough to call this the
                  // body: a union of object types has several, and the ones
                  // after the first are still the return type. What separates
                  // them is the character in front - a type operator continues
                  // the annotation, anything else starts the body.
                  //
                  //   ): { ok: true, value: T } | { ok: false, error: string } {
                  //                              ^ union, not the body        ^ body
                  //
                  // Taking the union's second object as the body made the whole
                  // function read as empty, so every parameter looked unused -
                  // and the autofix then renamed them to `_name` while leaving
                  // the body referring to `name`, which does not compile.
                  if (bodySawBracePair && bodyAngleDepth === 0 && !TYPE_CONTINUATION.has(lastNonWhitespaceBeforeBrace)) {
                    foundIdx = i
                    break
                  }
                  // This is the first '{' - could be inside return type or function body
                }
                bodyBraceDepth++
              }
              else if (c === '}') {
                if (bodyBraceDepth > 0) {
                  bodyBraceDepth--
                  if (bodyBraceDepth === 0) {
                    // We've closed a brace pair (likely in return type annotation)
                    bodySawBracePair = true
                    // Recorded because the tracker above skips braces, and
                    // without this the character in front of the next candidate
                    // is whatever preceded the pair - the union's `|`, forever.
                    lastNonWhitespaceBeforeBrace = '}'
                  }
                }
              }
            }
            else {
              if ((bodyInStr === 'single' && c === '\'')
                || (bodyInStr === 'double' && c === '"')
                || (bodyInStr === 'template' && c === '`')) {
                bodyInStr = null
              }
            }
          }
          // If we didn't find it with the brace pair logic:
          // - If inside a brace pair AND the '{' directly followed ':' (object return type), continue to next line
          // - Otherwise, use the first '{' on this line (common case: no return type)
          if (foundIdx === -1) {
            /*
             * An unclosed `<` means the return type is still open, whatever
             * else this line contained.
             *
             * A union written across lines inside a generic closes each of its
             * object types on the line it opens:
             *
             *     ): Promise<
             *       | { ok: true, value: T }
             *       | { ok: false, reason: string }
             *     > {
             *
             * so by the end of the second line the brace depth is back to zero
             * and the fallback below took that line's `{` for the body. The
             * body then read as one union member, every parameter looked
             * unused, and `--fix` renamed them while the real body still used
             * them.
             */
            if (bodyAngleDepth > 0)
              continue

            if (bodyBraceDepth > 0 && TYPE_CONTINUATION.has(lastNonWhitespaceBeforeBrace)) {
              // An open brace that began the return type, still unclosed when
              // the line ended: a multi-line object type. Keep reading.
              //
              // The test used to be `=== ':'` alone, which covered `): {` and
              // missed `): Promise<{`. Falling through on that one took the
              // generic's own brace for the body, so the body read as the
              // annotation, every parameter looked unused, and `--fix` renamed
              // them out from under the code that used them.
              continue
            }
            // No brace pair in progress, find the first '{' (common case: no return type annotation)
            for (let i = searchStart; i < lineToProcess.length; i++) {
              const c = lineToProcess[i]
              if (c === '{' && !bodyInStr) {
                foundIdx = i
                break
              }
            }
          }
          if (foundIdx === -1)
            continue
          openFound = true
          depth = 1
          startIdx = foundIdx + 1
          startLine = ln // Update startLine to where body '{' was actually found
        }
        // Track string state to skip braces inside strings and template literals.
        // Template literals with ${} expressions need stack-based tracking because
        // nested templates (e.g., `${cond ? `inner` : ''}`) require knowing the
        // brace depth at each nesting level.
        // NOTE: State persists across lines via depthInSingle/depthInDouble/depthTmplStack/depthEscaped
        // which are declared before the outer loop.
        for (let k = startIdx; k < lineToProcess.length; k++) {
          const ch = lineToProcess[k]

          if (depthEscaped) {
            depthEscaped = false
            continue
          }

          const inTmplBody = depthTmplStack.length > 0 && depthTmplStack[depthTmplStack.length - 1] === -1
          const inTmplExpr = depthTmplStack.length > 0 && depthTmplStack[depthTmplStack.length - 1] >= 0

          if (ch === '\\' && (depthInSingle || depthInDouble || inTmplBody)) {
            depthEscaped = true
            continue
          }

          if (depthInSingle) {
            // eslint-disable-next-line style/max-statements-per-line
            if (ch === '\'') depthInSingle = false
            continue
          }
          if (depthInDouble) {
            // eslint-disable-next-line style/max-statements-per-line
            if (ch === '"') depthInDouble = false
            continue
          }

          if (inTmplBody) {
            // eslint-disable-next-line style/max-statements-per-line
            if (ch === '`') { depthTmplStack.pop() }
            else if (ch === '$' && k + 1 < lineToProcess.length && lineToProcess[k + 1] === '{') {
              // eslint-disable-next-line style/max-statements-per-line
              depthTmplStack[depthTmplStack.length - 1] = 0
              // eslint-disable-next-line style/max-statements-per-line
              k++ // skip the {
            }
            continue
          }

          if (inTmplExpr) {
            if (ch === '/') {
              if (scannerStartsRegex(lineToProcess, k)) {
                k++
                while (k < lineToProcess.length) {
                  if (lineToProcess[k] === '\\') {
                    k += 2
                    continue
                  }
                  if (lineToProcess[k] === '/') {
                    while (k + 1 < lineToProcess.length && /[gimsuvy]/.test(lineToProcess[k + 1])) {
                      k++
                    }
                    break
                  }
                  k++
                }
                continue
              }
            }
            if (ch === '`') {
              depthTmplStack.push(-1)
              continue
            }
            if (ch === '\'') {
              depthInSingle = true
              continue
            }
            if (ch === '"') {
              depthInDouble = true
              continue
            }
            if (ch === '{') {
              depthTmplStack[depthTmplStack.length - 1]++
              continue
            }
            if (ch === '}') {
              if (depthTmplStack[depthTmplStack.length - 1] > 0) {
                depthTmplStack[depthTmplStack.length - 1]--
              }
              else {
                depthTmplStack[depthTmplStack.length - 1] = -1 // back to template body
              }
            }
            continue
          }

          // Outside any string/template
          if (ch === '\'') { depthInSingle = true }
          else if (ch === '"') { depthInDouble = true }
          else if (ch === '`') { depthTmplStack.push(-1) }
          else if (ch === '{') { depth++ }
          else if (ch === '}') {
            depth--
            if (depth === 0)
              return { from: startLine, to: ln }
          }
        }
      }
      return null
    }
    const collectArrowExpressionBody = (startLine: number, arrowCol: number): string => {
      const state = {
        parenDepth: 0,
        braceDepth: 0,
        bracketDepth: 0,
        inTemplate: false,
      }
      const updateState = (text: string): void => {
        for (let k = 0; k < text.length; k++) {
          const ch = text[k]
          if (ch === '`')
            state.inTemplate = !state.inTemplate
          else if (ch === '(')
            state.parenDepth++
          else if (ch === ')')
            state.parenDepth--
          else if (ch === '{')
            state.braceDepth++
          else if (ch === '}')
            state.braceDepth--
          else if (ch === '[')
            state.bracketDepth++
          else if (ch === ']')
            state.bracketDepth--
        }
      }
      const isOpen = (): boolean =>
        state.parenDepth > 0 || state.braceDepth > 0 || state.bracketDepth > 0 || state.inTemplate
      const endsWithContinuation = (text: string): boolean =>
        /(?:\?|:|\.|,|&&|\|\||\?\?|\+|-|\*|\/|%|\*\*)$/.test(text.trimEnd())
      const startsWithContinuation = (text: string): boolean =>
        /^(?:\?|:|\.|,|&&|\|\||\?\?|\+|-|\*|\/|%|\*\*)/.test(text.trimStart())

      let bodyText = lines[startLine].slice(arrowCol + 2)
      updateState(bodyText)

      let nextLine = startLine + 1
      while (nextLine < lines.length) {
        const previousLine = nextLine === startLine + 1 ? bodyText : lines[nextLine - 1]
        const shouldContinue = !bodyText.trim()
          || isOpen()
          || endsWithContinuation(previousLine)
          || startsWithContinuation(lines[nextLine])

        if (!shouldContinue)
          break

        bodyText += `\n${lines[nextLine]}`
        updateState(lines[nextLine])
        nextLine++
      }

      return bodyText
    }

    // Multi-line template literal state tracking for main processing loop.
    // Persists across lines to correctly mask generated code inside template body content.
    const mainTmplStack: number[] = [] // -1 = in template body, >= 0 = in ${} expr with that brace depth
    let mainInSingle = false
    let mainInDouble = false
    let mainEscaped = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comment-only lines
      if (/^\s*\/\//.test(line))
        continue

      // Skip lines that start inside a template literal body — that's
      // generated code (e.g. injected <script> blobs), not real TS, and
      // a `function(a)` pattern there is not a real declaration whose
      // parameter we can analyze for usage.
      if (lineStartsInTemplate[i])
        continue

      // Strip inline comments for processing (but keep original line for column reporting)
      // Need to be careful not to strip // inside strings or regex literals
      let codeOnly = line
      // Find // that's outside of strings and regex
      let inStr: 'single' | 'double' | 'template' | null = null
      let inRegex = false
      let escaped = false
      for (let idx = 0; idx < line.length - 1; idx++) {
        const ch = line[idx]
        const next = line[idx + 1]

        if (escaped) {
          escaped = false
          continue
        }

        if (ch === '\\' && (inStr || inRegex)) {
          escaped = true
          continue
        }

        if (!inStr && !inRegex) {
          if (ch === '\'') {
            inStr = 'single'
          }
          else if (ch === '"') {
            inStr = 'double'
          }
          else if (ch === '`') {
            inStr = 'template'
          }
          else if (ch === '/') {
            // Check if this is a regex or a comment
            // Regex can appear after: = ( [ { , : ; ! & | ? or at start of line
            if (scannerStartsRegex(line, idx)) {
              inRegex = true
            }
            else if (next === '/') {
              codeOnly = line.slice(0, idx)
              break
            }
          }
        }
        else if (inStr) {
          if ((inStr === 'single' && ch === '\'')
            || (inStr === 'double' && ch === '"')
            || (inStr === 'template' && ch === '`')) {
            inStr = null
          }
        }
        else if (inRegex && ch === '/') {
          inRegex = false
        }
      }

      // Also strip regex literals to avoid matching => inside regex patterns
      // Use the same helper function from linter.ts
      const stripRegex = (str: string): string => {
        let result = ''
        let i = 0
        while (i < str.length) {
          if (str[i] === '/') {
            if (scannerStartsRegex(str, i)) {
              i++ // skip opening /
              while (i < str.length) {
                if (str[i] === '\\') {
                  i += 2
                  continue
                }
                if (str[i] === '/') {
                  i++ // skip closing /
                  while (i < str.length && /[gimsuvy]/.test(str[i])) {
                    i++
                  }
                  break
                }
                i++
              }
              continue
            }
          }
          result += str[i]
          i++
        }
        return result
      }
      const codeNoRegex = stripRegex(codeOnly)
      // Also strip string contents to avoid matching keywords inside strings (e.g., 'no-empty-function')
      let codeClean = codeNoRegex.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'').replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // Mask template literal body content using stack-based tracking that persists across lines.
      // Content inside ${} expressions is preserved (it's real code), body content is masked.
      // This handles both single-line and multi-line templates correctly, including nested templates.
      {
        let masked = ''
        for (let ci = 0; ci < codeClean.length; ci++) {
          const ch = codeClean[ci]

          if (mainEscaped) {
            mainEscaped = false
            const inBody = mainTmplStack.length > 0 && mainTmplStack[mainTmplStack.length - 1] === -1
            masked += inBody ? ' ' : ch
            continue
          }

          const inBody = mainTmplStack.length > 0 && mainTmplStack[mainTmplStack.length - 1] === -1
          const inExpr = mainTmplStack.length > 0 && mainTmplStack[mainTmplStack.length - 1] >= 0

          if (ch === '\\' && (mainInSingle || mainInDouble || inBody)) {
            mainEscaped = true
            masked += inBody ? ' ' : ch
            continue
          }

          if (mainInSingle) {
            if (ch === '\'') mainInSingle = false
            masked += ch
            continue
          }

          if (mainInDouble) {
            if (ch === '"') mainInDouble = false
            masked += ch
            continue
          }

          // Inside template body (literal content — not real code)
          if (inBody) {
            if (ch === '`') {
              mainTmplStack.pop()
            }
else if (ch === '$' && ci + 1 < codeClean.length && codeClean[ci + 1] === '{') {
              mainTmplStack[mainTmplStack.length - 1] = 0
              masked += '  '
              ci++
            }
else {
              masked += ' '
            }
            continue
          }

          // Inside ${} expression (real code inside template)
          if (inExpr) {
            if (ch === '`') {
              mainTmplStack.push(-1)
              masked += ' '
            }
else if (ch === '\'') {
              mainInSingle = true
              masked += ch
            }
else if (ch === '"') {
              mainInDouble = true
              masked += ch
            }
else if (ch === '{') {
              mainTmplStack[mainTmplStack.length - 1]++
              masked += ch
            }
else if (ch === '}') {
              if (mainTmplStack[mainTmplStack.length - 1] > 0) {
                mainTmplStack[mainTmplStack.length - 1]--
                masked += ch
              }
else {
                mainTmplStack[mainTmplStack.length - 1] = -1
                masked += ' '
              }
            }
else {
              masked += ch
            }
            continue
          }

          // Outside any template/string
          if (ch === '`') {
            mainTmplStack.push(-1)
            masked += ' '
          }
else if (ch === '\'') {
            mainInSingle = true
            masked += ch
          }
else if (ch === '"') {
            mainInDouble = true
            masked += ch
          }
else {
            masked += ch
          }
        }
        codeClean = masked
      }

      // function declarations or expressions
      const m = codeClean.match(/\bfunction\b/)
      if (m) {
        // Skip known complex functions with deep nesting that cause false positives
        if (line.includes('function scanContent') || line.includes('function findMatching')) {
          continue
        }
        // Skip 'function' used as a property name in destructuring: { function: value }
        const afterFunc = codeClean.slice(m.index! + 8).trimStart()
        if (afterFunc.startsWith(':')) {
          continue
        }
        // Skip property access — `obj.function` / `obj?.function` is not a declaration.
        const beforeFunc = codeClean.slice(0, m.index!).trimEnd()
        if (beforeFunc.endsWith('.') || beforeFunc.endsWith('?.')) {
          continue
        }
        // Find the opening ( for parameters
        const funcIdx = m.index!
        const openParenIdx = line.indexOf('(', funcIdx)
        if (openParenIdx === -1)
          continue

        // Find matching closing ) by counting parentheses - may span multiple lines
        let depth = 0
        let closeParenIdx = -1
        let closeParenLine = i
        let paramStr = ''

        // Start from the opening parenthesis
        for (let ln = i; ln < lines.length; ln++) {
          const searchLine = ln === i ? lines[ln] : lines[ln]
          const startIdx = ln === i ? openParenIdx : 0

          for (let k = startIdx; k < searchLine.length; k++) {
            if (searchLine[k] === '(') {
              depth++
            }
            else if (searchLine[k] === ')') {
              depth--
              if (depth === 0) {
                closeParenIdx = k
                closeParenLine = ln
                // Collect parameter text across all lines
                if (i === ln) {
                  // Single line function
                  paramStr = line.slice(openParenIdx + 1, closeParenIdx)
                }
                else {
                  // Multi-line function - collect all parameter text
                  paramStr = line.slice(openParenIdx + 1) // rest of first line
                  for (let j = i + 1; j < ln; j++) {
                    paramStr += ` ${lines[j]}` // middle lines
                  }
                  paramStr += ` ${searchLine.slice(0, closeParenIdx)}` // last line up to )
                }
                break
              }
            }
          }
          if (closeParenIdx !== -1)
            break
        }

        if (closeParenIdx === -1)
          continue

        // Extract parameters from the collected parameter string
        const params = getParamNames(paramStr)
        // Start searching for function body after the closing parenthesis to avoid matching braces in type annotations
        // Use closeParenLine since the closing ) might be on a different line
        const bodyRange = findBodyRange(closeParenLine, closeParenIdx)
        // Get body text starting from the line after opening '{' to avoid matching parameter declarations
        let bodyText = ''
        if (bodyRange) {
          // If body is on the same line as the closing paren, get content after '{'
          if (bodyRange.from === closeParenLine) {
            const bodyStartLine = lines[bodyRange.from]
            const braceIdx = bodyStartLine.lastIndexOf('{')
            const restOfFirstLine = braceIdx >= 0 ? bodyStartLine.slice(braceIdx + 1) : ''
            if (bodyRange.to > bodyRange.from) {
              bodyText = `${restOfFirstLine}\n${lines.slice(bodyRange.from + 1, bodyRange.to + 1).join('\n')}`
            }
            else {
              bodyText = restOfFirstLine
            }
          }
          else {
            bodyText = lines.slice(bodyRange.from, bodyRange.to + 1).join('\n')
          }
        }
        for (const name of params) {
          if (!name || argIgnoreRe.test(name) || name === 'undefined')
            continue
          const re = new RegExp(`\\b${name}\\b`, 'g')
          if (!re.test(bodyText)) {
            issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is defined but never used (function parameter). Allowed unused args must match pattern: ${argsIgnorePattern}`, severity: 'error' })
          }
        }
        continue
      }

      // arrow functions (parenthesized params) - match patterns like: const f = (a,b) => ..., or standalone (a,b) => ...
      // Find arrow first, then work backwards to find the parameters
      const arrowIdx = line.indexOf('=>')
      if (arrowIdx !== -1 && codeClean.includes('=>')) {
        // Work backwards from => to find the closing ) of parameters
        let closeParenIdx = -1
        for (let k = arrowIdx - 1; k >= 0; k--) {
          const ch = line[k]
          if (ch === ')') {
            closeParenIdx = k
            break
          }
          // Skip whitespace and type annotations (colon followed by type)
          if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== ':' && ch !== '>' && !/\w/.test(ch)) {
            break
          }
        }

        // Only process if we found a closing paren (otherwise let single-param handler deal with it)
        if (closeParenIdx !== -1) {
          // Now find the matching opening (
          let openParenIdx = -1
          let depth = 1
          for (let k = closeParenIdx - 1; k >= 0; k--) {
            const ch = line[k]
            if (ch === ')') {
              depth++
            }
            else if (ch === '(') {
              depth--
              if (depth === 0) {
                openParenIdx = k
                break
              }
            }
          }

          if (openParenIdx !== -1) {
            // Check if there's a colon or angle bracket before the opening paren (type signature vs function)
            // Look backwards from opening paren to find if this is a type annotation
            // Continue past commas to find `<` for generics like Map<string, (...args) => any>
            // Continue past balanced nested parens (for `: boolean | ((args) => T)`)
            // and past type-union/intersection markers `|` `&`.
            let isTypeSignature = false
            let angleDepthBack = 0
            let parenDepthBack = 0
            for (let k = openParenIdx - 1; k >= 0; k--) {
              const ch = line[k]
              if (ch === '>') {
                angleDepthBack++
                continue
              }
              if (ch === '<') {
                if (angleDepthBack > 0) {
                  angleDepthBack--
                  continue
                }
                if (parenDepthBack === 0) {
                  isTypeSignature = true
                  break
                }
                continue
              }
              if (ch === ':' && angleDepthBack === 0 && parenDepthBack === 0) {
                isTypeSignature = true
                break
              }
              if (angleDepthBack > 0)
                continue
              // Continue past commas to check if we're inside a generic type parameter
              if (ch === ',')
                continue
              // Walk through nested parens. When we descend BELOW the
              // starting depth (parenDepthBack goes negative), we're
              // looking at characters BEFORE an enclosing `(`. We keep
              // walking — the type-context check just needs to find a
              // marker like `:`, `|`, `&`, `<` somewhere.
              if (ch === ')') {
                parenDepthBack++
                continue
              }
              if (ch === '(') {
                parenDepthBack--
                continue
              }
              // Type-union / intersection markers — strong signal we're in
              // a type context like `string | (...) => T`.
              if (ch === '|' || ch === '&') {
                isTypeSignature = true
                break
              }
              // Stop at these characters that indicate we've gone too far
              // into a value context (only at our starting depth, not inside
              // a balanced inner paren).
              if (ch === '=' || ch === '{' || ch === '[') {
                if (parenDepthBack >= 0)
                  break
                continue
              }
              // Skip whitespace, identifiers, and dots (for dotted type names)
              if (ch !== ' ' && ch !== '\t' && !/[\w.]/.test(ch)) {
                if (parenDepthBack >= 0)
                  break
              }
            }

            // Two more type-signature contexts the backward scan above
            // doesn't catch on its own:
            //
            // 1. `type Foo = (x: T) => U` / `export type Foo = ...`
            //    The walk back stops at `=` before reaching `type`. Detect
            //    the type-alias prefix on the line directly.
            //
            // 2. `(x as (...a: T) => U)(...)` — type assertion wrapping a
            //    callable. The walk back stops at the outer `(`. Look for
            //    a `\bas\b` keyword in the slice between the outer `(`
            //    and the inner one we're inspecting.
            if (!isTypeSignature) {
              const beforeParen = line.slice(0, openParenIdx)
              if (/^\s*(?:export\s+)?(?:declare\s+)?type\s+\w[\w$]*\s*(?:<[^>]*>)?\s*=\s*$/.test(beforeParen)) {
                isTypeSignature = true
              }
              else if (/\bas\s+$/.test(beforeParen)) {
                isTypeSignature = true
              }
            }

            // Skip type signatures
            if (isTypeSignature) {
              continue
            }

            // Extract parameter text
            const paramText = line.slice(openParenIdx + 1, closeParenIdx)

            // Skip if this is an async arrow function with no parameters
            if (!(paramText.trim() === '' && line.slice(Math.max(0, openParenIdx - 10), openParenIdx).includes('async'))) {
              const params = getParamNames(paramText)
              if (params.length > 0) {
                let bodyText = ''
                // Check if there's a function body with braces (not just object literals in the expression)
                // Function body braces appear immediately after => with only whitespace in between
                const afterArrow = line.slice(arrowIdx + 2).trimStart()
                if (afterArrow.startsWith('{')) {
                  const bodyRange = findBodyRange(i, arrowIdx)
                  // Get body text, avoiding parameter declarations
                  if (bodyRange) {
                    if (bodyRange.from === i) {
                      const bodyStartLine = lines[bodyRange.from]
                      const braceIdx = bodyStartLine.indexOf('{', arrowIdx)
                      const restOfFirstLine = braceIdx >= 0 ? bodyStartLine.slice(braceIdx + 1) : ''
                      if (bodyRange.to > bodyRange.from) {
                        bodyText = `${restOfFirstLine}\n${lines.slice(bodyRange.from + 1, bodyRange.to + 1).join('\n')}`
                      }
                      else {
                        bodyText = restOfFirstLine
                      }
                    }
                    else {
                      bodyText = lines.slice(bodyRange.from, bodyRange.to + 1).join('\n')
                    }
                  }
                }
                else {
                  bodyText = collectArrowExpressionBody(i, arrowIdx)
                }
                for (const name of params) {
                  if (!name || argIgnoreRe.test(name) || name === 'undefined')
                    continue
                  const re = new RegExp(`\\b${name}\\b`, 'g')
                  if (!re.test(bodyText)) {
                    issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is defined but never used (function parameter). Allowed unused args must match pattern: ${argsIgnorePattern}`, severity: 'error' })
                  }
                }
                continue
              }
            }
          }
        }
      }

      // arrow functions (single identifier param without parentheses): x => ... possibly embedded, e.g., arr.map(x=>x)
      {
        const reSingleArrow = /(?:^|[=,:({\s])\s*([$A-Z_][\w$]*)\s*=>/gi
        let match: RegExpExecArray | null
        // eslint-disable-next-line no-cond-assign
        while ((match = reSingleArrow.exec(codeClean)) !== null) {
          const name = match[1]
          if (!name || argIgnoreRe.test(name) || name === 'undefined')
            continue
          // Skip return type annotations like ): ReturnType => or ): string =>
          // When : precedes the identifier and ) precedes the :, it's a return type
          const beforeMatch = codeClean.slice(0, match.index + match[0].indexOf(name)).trimEnd()
          if (/\)\s*:$/.test(beforeMatch) || /\)\s*:\s*$/.test(beforeMatch)) {
            continue
          }
          // A type predicate is a return type too: `(entry): entry is Thing =>`
          // put `Thing` immediately before the arrow, and it was read as a
          // bare-identifier parameter and reported unused. The check above only
          // knew the `): Type =>` form.
          if (/\)\s*:\s*[$A-Z_][\w$]*\s+is$/i.test(beforeMatch)) {
            continue
          }
          // Also skip if the matched name is a TypeScript keyword used as type
          if (/^(?:string|number|boolean|void|never|any|unknown|object|bigint|symbol|undefined|null)$/.test(name)) {
            continue
          }
          // Find the arrow position in the ORIGINAL line
          const arrowPattern = new RegExp(`\\b${name}\\s*=>`)
          const arrowMatch = line.match(arrowPattern)
          if (!arrowMatch)
            continue
          const arrowIdx = line.indexOf(arrowMatch[0]) + arrowMatch[0].lastIndexOf('=>')
          let bodyText = ''
          // Check if there's a function body with braces (not just object literals in the expression)
          const afterArrow = line.slice(arrowIdx + 2).trimStart()
          if (afterArrow.startsWith('{')) {
            const bodyRange = findBodyRange(i, arrowIdx)
            // Get body text, avoiding parameter declarations
            if (bodyRange) {
              if (bodyRange.from === i) {
                const bodyStartLine = lines[bodyRange.from]
                const braceIdx = bodyStartLine.indexOf('{', arrowIdx)
                const restOfFirstLine = braceIdx >= 0 ? bodyStartLine.slice(braceIdx + 1) : ''
                if (bodyRange.to > bodyRange.from) {
                  bodyText = `${restOfFirstLine}\n${lines.slice(bodyRange.from + 1, bodyRange.to + 1).join('\n')}`
                }
                else {
                  bodyText = restOfFirstLine
                }
              }
              else {
                bodyText = lines.slice(bodyRange.from, bodyRange.to + 1).join('\n')
              }
            }
          }
          else {
            bodyText = collectArrowExpressionBody(i, arrowIdx)
          }
          const useRe = new RegExp(`\\b${name}\\b`, 'g')
          if (!useRe.test(bodyText)) {
            issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is defined but never used (function parameter). Allowed unused args must match pattern: ${argsIgnorePattern}`, severity: 'error' })
          }
        }
      }
    }

    return issues
  },

  /**
   * Auto-fix function-parameter issues by prefixing the parameter name
   * with `_` so it matches the configured `argsIgnorePattern` (default
   * `^_`). We deliberately don't auto-fix variable issues — those
   * typically want deletion, which is too risky without scope info.
   *
   * The reported column is unreliable (it comes from `line.indexOf(name)`
   * which can hit a coincidental occurrence in a string literal earlier
   * on the line). We re-find the parameter by pinning the match to a
   * function-parameter context: preceded by `(` or `,` (with optional
   * whitespace), followed by `,`, `)`, `:`, or `=`. This avoids
   * string-literal hits and `let x = ...` style declarations.
   *
   * The rule's `check` already skips lines inside template-literal
   * bodies, so by the time we look at issues here we've already filtered
   * out generated-code false positives.
   */
  fix: (text, ctx) => {
    const issues = noUnusedVarsRule.check(text, ctx)
    if (issues.length === 0)
      return text

    const paramIssues = issues.filter(i => i.message.includes('(function parameter)'))
    if (paramIssues.length === 0)
      return text

    // Pre-compute which lines are suppressed by `// eslint-disable-next-line`
    // / `// pickier-disable-next-line` directives on the line above. The
    // linter normally applies this filter at the issue-collection layer, but
    // when we re-run `check` here we bypass it — so we must do the same
    // filtering ourselves before rewriting code.
    const allSrcLines = text.split(/\r?\n/)
    const disabledLines = new Set<number>()
    const disableNextRe = /(?:eslint|pickier)-disable-next-line\b([^*\n]*)/
    for (let i = 0; i < allSrcLines.length; i++) {
      const m = allSrcLines[i].match(disableNextRe)
      if (!m)
        continue
      const ruleList = m[1].trim()
      // Empty list means "disable all rules" for the next line.
      if (ruleList === ''
        || /\bno-unused-vars\b/.test(ruleList)
        || /\bpickier\/no-unused-vars\b/.test(ruleList)) {
        disabledLines.add(i + 2) // 1-indexed line directly below
      }
    }

    const byLine = new Map<number, Set<string>>()
    for (const issue of paramIssues) {
      if (disabledLines.has(issue.line))
        continue
      const nameMatch = issue.message.match(/^'([^']+)'/)
      if (!nameMatch)
        continue
      const name = nameMatch[1]
      if (name.startsWith('_'))
        continue
      let names = byLine.get(issue.line)
      if (!names) {
        names = new Set()
        byLine.set(issue.line, names)
      }
      names.add(name)
    }
    if (byLine.size === 0)
      return text

    // Compute backtick spans on each line so we can skip matches that
    // fall inside a single-line template literal (where the rule's
    // multi-line tracker can't help — a template that opens and closes
    // on the same line has `lineStartsInTemplate` = false but its
    // contents are still embedded code we shouldn't rewrite).
    const lines = text.split(/\r?\n/)
    function backtickRanges(line: string): Array<[number, number]> {
      const out: Array<[number, number]> = []
      let inS = false
      let inD = false
      let esc = false
      let openTick = -1
      for (let k = 0; k < line.length; k++) {
        const ch = line[k]
        if (esc) {
          esc = false
          continue
        }
        if (ch === '\\' && (inS || inD || openTick >= 0)) {
          esc = true
          continue
        }
        if (openTick >= 0) {
          if (ch === '`') {
            out.push([openTick, k])
            openTick = -1
          }
          continue
        }
        if (inS) {
          if (ch === '\'') inS = false
          continue
        }
        if (inD) {
          if (ch === '"') inD = false
          continue
        }
        if (ch === '`') openTick = k
        else if (ch === '\'') inS = true
        else if (ch === '"') inD = true
      }
      // If a backtick opened but didn't close on this line, treat the
      // remainder of the line as inside a template — it's the first line
      // of a multi-line template literal.
      if (openTick >= 0)
        out.push([openTick, line.length])
      return out
    }
    let changed = false
    for (const [lineNum, names] of byLine) {
      const lineIdx = lineNum - 1
      const line = lines[lineIdx]
      if (line === undefined)
        continue
      const tickSpans = backtickRanges(line)
      const inAnyTick = (pos: number): boolean => tickSpans.some(([a, b]) => pos > a && pos < b)
      const edits: Array<{ start: number, end: number, name: string }> = []
      for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`(?<=[(,]\\s*)\\b${escaped}\\b(?=\\s*[,):=])`, 'g')
        let m: RegExpExecArray | null
        // eslint-disable-next-line no-cond-assign
        while ((m = re.exec(line)) !== null) {
          if (inAnyTick(m.index))
            continue
          edits.push({ start: m.index, end: m.index + name.length, name })
        }
      }
      if (edits.length === 0)
        continue
      edits.sort((a, b) => b.start - a.start)
      let next = line
      for (const e of edits) {
        next = `${next.slice(0, e.start)}_${e.name}${next.slice(e.end)}`
      }
      if (next !== line) {
        lines[lineIdx] = next
        changed = true
      }
    }
    return changed ? lines.join('\n') : text
  },
}
