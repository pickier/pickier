/**
 * One lexical pass over JS/TS source: which characters are code, and which
 * are comment, string, template or regex content.
 *
 * Rules here are heuristics over text rather than walks over an AST, and
 * nearly every one needs to know whether a character is code before it can
 * reason about it. Each used to answer that with its own little scanner, and
 * each scanner got a different subset of the language wrong:
 *
 *     /** Uses the `bucket's` policy *\/
 *
 * is a comment, but a scanner that does not know it is in one sees a
 * backtick open a template literal that the next backtick in real code
 * "closes", and every string and template after that is read inside out. A
 * regex scanner that misses `/['"]/` opens a string at the quote. One that
 * reads `\/\/` inside a regex as a line comment drops the rest of the line.
 * The symptom is always the same - a used name is reported unused, or a
 * real finding vanishes - and it shows up far from the character that caused
 * it, which is why it kept being patched one shape at a time.
 *
 * So the language's lexical layer lives here, once:
 *
 * - line and block comments, and a leading hashbang;
 * - single- and double-quoted strings, which end at an unescaped newline
 *   (unterminated in valid code, so a stray quote cannot run to the end of
 *   the file) and continue across an escaped one;
 * - template literals, nested to any depth through `${}`, where each
 *   expression is ordinary code with its own brace depth - including further
 *   templates, strings, comments and regexes;
 * - regex literals, told apart from division by the token before them, with
 *   character classes (`/[/]/` is one pattern) and escapes. A `/` that
 *   would open a pattern but finds no closing `/` on its line is division:
 *   a regex literal cannot span lines, so guessing wrong costs one character
 *   rather than the rest of the file.
 *
 * {@link maskSource} is what most callers want: the same text with the
 * contents of the chosen regions replaced by spaces. Delimiters, offsets and
 * line breaks are all kept, so a column found in the masked text is the
 * column in the original, and scanners that look for `/*` or a quote still
 * find them.
 */

export type RegionKind = 'comment' | 'string' | 'template' | 'regex'

export interface Region {
  kind: RegionKind
  /** Offset of the first content character, after any opening delimiter. */
  start: number
  /** Offset just past the last content character, before any closing delimiter. */
  end: number
}

export interface LexResult {
  /** Non-code regions in source order. Template regions are body text only, never a `${}` expression. */
  regions: Region[]
  /**
   * Outermost template literals as `[openingBacktick, closingBacktick]`.
   * An unterminated template ends at the end of the text.
   */
  templates: Array<[number, number]>
}

/** Keywords after which a `/` opens a pattern rather than dividing. */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await', 'throw'])

const WORD_CHAR = /[\w$ -￿]/

/** Whether `text[at]` is a line break. */
function isBreak(ch: string | undefined): boolean {
  return ch === '\n' || ch === '\r' || ch === ' ' || ch === ' '
}

/**
 * The offset just past a regex literal that opens at `at`, or -1 when the
 * slash cannot open one because no closing slash follows on its line.
 */
function regexEnd(text: string, at: number): number {
  let index = at + 1
  let inClass = false

  while (index < text.length) {
    const ch = text[index]!

    if (isBreak(ch))
      return -1

    if (ch === '\\') {
      if (isBreak(text[index + 1]))
        return -1
      index += 2
      continue
    }

    if (inClass) {
      if (ch === ']')
        inClass = false
    }
    else if (ch === '[') {
      inClass = true
    }
    else if (ch === '/') {
      index += 1
      while (index < text.length && WORD_CHAR.test(text[index]!))
        index += 1
      return index
    }

    index += 1
  }

  return -1
}

/**
 * Lex `text` once, returning every comment, string, template-body and regex
 * region. See the module comment for what is handled.
 */
export function lexSource(text: string): LexResult {
  const regions: Region[] = []
  const templates: Array<[number, number]> = []
  const length = text.length

  /*
   * -1 is a template body; a number >= 0 is a `${}` expression holding its
   * own brace depth. Empty means top-level code.
   */
  const frames: number[] = []
  let outerTemplateStart = -1

  /*
   * What the last significant token was, for regex-versus-division:
   * 'value' (identifier, number, literal, closing paren or bracket) means a
   * `/` divides; 'operator' means it opens a pattern. A keyword that can
   * precede an expression is recorded as an operator.
   */
  let last: 'value' | 'operator' = 'operator'

  let index = 0

  // A hashbang is a comment that only exists on the first line.
  if (text.startsWith('#!')) {
    let end = 2
    while (end < length && !isBreak(text[end]))
      end += 1
    regions.push({ kind: 'comment', start: 2, end })
    index = end
  }

  const openTemplate = (at: number): void => {
    if (frames.length === 0)
      outerTemplateStart = at
    frames.push(-1)
  }

  /** Scan a template body starting at `index`; stops at the closing backtick or a `${`. */
  const scanBody = (): void => {
    const start = index
    while (index < length) {
      const ch = text[index]!
      if (ch === '\\') {
        index += 2
        continue
      }
      if (ch === '`') {
        regions.push({ kind: 'template', start, end: index })
        frames.pop()
        if (frames.length === 0)
          templates.push([outerTemplateStart, index])
        index += 1
        last = 'value'
        return
      }
      if (ch === '$' && text[index + 1] === '{') {
        regions.push({ kind: 'template', start, end: index })
        frames.push(0)
        index += 2
        last = 'operator'
        return
      }
      index += 1
    }

    // Unterminated: the body runs to the end of the text.
    index = Math.min(index, length)
    regions.push({ kind: 'template', start, end: index })
    frames.length = 0
    templates.push([outerTemplateStart, length])
  }

  while (index < length) {
    if (frames.length > 0 && frames[frames.length - 1] === -1) {
      scanBody()
      continue
    }

    const ch = text[index]!
    const next = text[index + 1]

    if (ch === '/' && next === '/') {
      let end = index + 2
      while (end < length && !isBreak(text[end]))
        end += 1
      regions.push({ kind: 'comment', start: index + 2, end })
      index = end
      continue
    }

    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', index + 2)
      const end = close < 0 ? length : close
      regions.push({ kind: 'comment', start: index + 2, end })
      index = close < 0 ? length : close + 2
      continue
    }

    if (ch === '\'' || ch === '"') {
      const start = index + 1
      let end = start
      while (end < length) {
        const c = text[end]!
        if (c === '\\') {
          // An escaped line break continues the string; \r\n is one break.
          end += text[end + 1] === '\r' && text[end + 2] === '\n' ? 3 : 2
          continue
        }
        if (c === ch || isBreak(c))
          break
        end += 1
      }
      end = Math.min(end, length)
      regions.push({ kind: 'string', start, end })
      index = text[end] === ch ? end + 1 : end
      last = 'value'
      continue
    }

    if (ch === '`') {
      openTemplate(index)
      index += 1
      continue
    }

    if (ch === '/') {
      const end = last === 'operator' ? regexEnd(text, index) : -1
      if (end > 0) {
        // The pattern's body, without its delimiters or flags.
        let close = end
        while (close > index && text[close - 1] !== '/')
          close -= 1
        regions.push({ kind: 'regex', start: index + 1, end: close - 1 })
        index = end
        last = 'value'
        continue
      }
      index += 1
      last = 'operator'
      continue
    }

    if (frames.length > 0) {
      if (ch === '{') {
        frames[frames.length - 1]! += 1
        index += 1
        last = 'operator'
        continue
      }
      if (ch === '}') {
        const depth = frames[frames.length - 1]!
        if (depth > 0) {
          frames[frames.length - 1] = depth - 1
          last = 'operator'
        }
        else {
          // Back into the template body that owns this expression.
          frames.pop()
        }
        index += 1
        continue
      }
    }

    if (WORD_CHAR.test(ch)) {
      let end = index + 1
      while (end < length && WORD_CHAR.test(text[end]!))
        end += 1
      const word = text.slice(index, end)
      last = REGEX_AFTER_WORD.has(word) ? 'operator' : 'value'
      index = end
      continue
    }

    if (ch === ')' || ch === ']') {
      last = 'value'
    }
    else if (!/\s/.test(ch)) {
      // `}` included: after a block a `/` starts a statement, so a pattern.
      last = 'operator'
    }

    index += 1
  }

  return { regions, templates }
}

export interface MaskOptions {
  comments?: boolean
  strings?: boolean
  templates?: boolean
  regex?: boolean
}

/**
 * `text` with the contents of the chosen region kinds replaced by spaces.
 *
 * Line breaks, delimiters and length are unchanged. With no options only
 * comments are blanked, which is the common need: prose can then never be
 * mistaken for code. A template's `${}` expressions are code and are never
 * blanked.
 */
export function maskSource(text: string, options: MaskOptions = { comments: true }, lexed: LexResult = lexSource(text)): string {
  const wanted = new Set<RegionKind>()
  if (options.comments)
    wanted.add('comment')
  if (options.strings)
    wanted.add('string')
  if (options.templates)
    wanted.add('template')
  if (options.regex)
    wanted.add('regex')

  if (wanted.size === 0)
    return text

  const out = text.split('')
  for (const region of lexed.regions) {
    if (!wanted.has(region.kind))
      continue
    for (let at = region.start; at < region.end && at < out.length; at += 1) {
      if (!isBreak(out[at]))
        out[at] = ' '
    }
  }

  return out.join('')
}

/** Every comment's contents blanked; everything else as written. */
export function maskComments(text: string): string {
  return maskSource(text, { comments: true })
}

/** Only code left: comments, strings, template bodies and regex patterns blanked. */
export function maskNonCode(text: string): string {
  return maskSource(text, { comments: true, strings: true, templates: true, regex: true })
}

/**
 * For each line, whether it begins inside a template-literal body - between
 * a backtick (or the `}` closing a `${}`) and the next backtick or `${`.
 *
 * A line that begins inside a `${}` expression is code, not template text.
 */
export function lineStartsInTemplate(text: string, lexed: LexResult = lexSource(text)): boolean[] {
  const starts: number[] = [0]
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '\n')
      starts.push(at + 1)
  }

  const out: boolean[] = Array.from({ length: starts.length }, () => false)
  const bodies = lexed.regions.filter(region => region.kind === 'template')
  let cursor = 0

  for (let line = 0; line < starts.length; line += 1) {
    const at = starts[line]!
    while (cursor < bodies.length && bodies[cursor]!.end < at)
      cursor += 1
    const body = bodies[cursor]
    // Inclusive at the end: a line whose first character is the closing
    // backtick (or a `${`) still begins inside the body.
    out[line] = body !== undefined && body.start <= at && at <= body.end && at > 0
  }

  return out
}
