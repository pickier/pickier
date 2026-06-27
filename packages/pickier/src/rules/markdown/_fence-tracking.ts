/**
 * CommonMark-compliant code-block detection for markdown.
 *
 * Returns a Set of 0-indexed line numbers that are inside any code block —
 * fenced (` ``` ... ``` ` / `~~~ ... ~~~`) or indented (4-space prefix). The
 * fence boundary lines themselves are also included.
 *
 * Per the CommonMark spec, a fenced code block:
 *  - Opens with at least 3 backticks or tildes, optionally followed by an
 *    "info string" (e.g. ` ```js `).
 *  - Closes only with the SAME fence character, AT LEAST as many of them
 *    as the opener, and an EMPTY info string (just the run of backticks
 *    or tildes plus optional trailing whitespace).
 *  - Anything else inside the block — including ` ```js ` lines — is
 *    content, not a fence boundary.
 *
 * The naive tracker that toggles on every `^`{3,}|~{3,}` confuses
 * `` ```js `` with a close and corrupts state for the rest of the file.
 * Use this helper instead.
 *
 * Indented code blocks: a line is treated as inside an indented code block
 * when it has 4+ leading spaces and the previous non-blank line is also
 * indented (or blank with another indented line above it). Lines inside a
 * fenced block don't double-count as indented.
 */
export function getCodeBlockLines(lines: string[]): Set<number> {
  const out = new Set<number>()
  let fenceChar: '`' | '~' | null = null
  let fenceLen = 0
  // Track indented-block state: we need to look back past blank lines to
  // tell whether a blank or a 4-space-indented line continues a block.
  let lastWasIndentedOrBlankInBlock = false
  let inIndentedBlock = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    // Fence boundary detection.
    if (fenceChar === null) {
      // Look for an opener: 3+ ticks or tildes, followed by an info string
      // that does NOT contain any backtick (CommonMark forbids this for
      // backtick fences) and does NOT include another fence run.
      const open = trimmed.match(/^(`{3,}|~{3,})(.*)$/)
      if (open) {
        const run = open[1]
        const info = open[2]
        const ch = run[0] as '`' | '~'
        // For backtick fences, the info string mustn't contain a backtick.
        if (ch === '`' && info.includes('`')) {
          // Not a valid fence opener — treat as content.
        }
        else {
          fenceChar = ch
          fenceLen = run.length
          out.add(i)
          // Opening a fence resets any indented-block tracking.
          lastWasIndentedOrBlankInBlock = false
          inIndentedBlock = false
          continue
        }
      }
    }
    else {
      // Inside a fence — every line is part of the block.
      out.add(i)
      // Check if THIS line closes the fence: same char, >= len ticks,
      // empty info (only trailing whitespace).
      const close = trimmed.match(/^(`{3,}|~{3,})\s*$/)
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null
        fenceLen = 0
      }
      continue
    }
    // Outside any fence — handle indented code blocks.
    const leadingSpaces = line.length - line.trimStart().length
    const hasTab = /^\t/.test(line)
    // 4+ leading spaces (or a leading tab) marks an indented code block,
    // BUT only if the previous non-blank line was also part of the block
    // OR there was a blank line above and the line before that was a
    // paragraph break. CommonMark is strict; we approximate by requiring
    // the previous logical line to be blank or indented.
    const isIndentedContent = (leadingSpaces >= 4 || hasTab) && trimmed.length > 0
    if (isIndentedContent) {
      // Start or continue an indented block. Per CommonMark, an indented
      // code block can only START after a blank line (not interrupting a
      // paragraph), so we use lastWasIndentedOrBlankInBlock to decide.
      if (inIndentedBlock || lastWasIndentedOrBlankInBlock || i === 0) {
        out.add(i)
        inIndentedBlock = true
      }
      // else: a 4-space-indented line that follows a paragraph stays as
      // continuation text rather than starting a code block.
      lastWasIndentedOrBlankInBlock = inIndentedBlock
      continue
    }
    if (trimmed.length === 0) {
      // Blank line — preserves indented-block state across the gap.
      if (inIndentedBlock) {
        out.add(i)
        lastWasIndentedOrBlankInBlock = true
      }
      else {
        // A blank line outside a code block makes the NEXT indented line
        // eligible to open a new block.
        lastWasIndentedOrBlankInBlock = true
      }
      continue
    }
    // Non-blank, non-indented — terminates any indented block.
    inIndentedBlock = false
    lastWasIndentedOrBlankInBlock = false
  }
  return out
}

/**
 * Like `getCodeBlockLines` but returns whether a single line index is
 * inside ANY kind of code block — handy for one-shot checks where you
 * don't already have the set computed.
 */
export function isInsideCodeBlock(lines: string[], targetIdx: number): boolean {
  return getCodeBlockLines(lines).has(targetIdx)
}

/**
 * Walk a single line and invoke `onText` for each run that sits OUTSIDE an
 * inline code span and `onCode` for each code span (backticks included).
 *
 * A code span is a run of N backticks, then any text, then the next run of
 * EXACTLY N backticks (CommonMark). Backtick runs without a matching close
 * are treated as ordinary text — never opening an unterminated span — so a
 * stray `` ` `` in prose can't swallow the rest of the line.
 */
function eachInlineSegment(
  line: string,
  onText: (segment: string) => void,
  onCode: (segment: string) => void,
): void {
  let i = 0
  let textStart = 0
  while (i < line.length) {
    if (line[i] !== '`') {
      i++
      continue
    }
    // Measure the opening backtick run.
    let n = 0
    while (line[i + n] === '`')
      n++
    // Find a closing run of EXACTLY n backticks.
    let j = i + n
    let close = -1
    while (j < line.length) {
      if (line[j] === '`') {
        let k = 0
        while (line[j + k] === '`')
          k++
        if (k === n) {
          close = j
          break
        }
        j += k
      }
      else {
        j++
      }
    }
    if (close === -1) {
      // No matching close — backticks are literal text. Skip past this run
      // so we don't re-measure it, leaving it in the pending text segment.
      i += n
      continue
    }
    if (textStart < i)
      onText(line.slice(textStart, i))
    onCode(line.slice(i, close + n))
    i = close + n
    textStart = i
  }
  if (textStart < line.length)
    onText(line.slice(textStart))
}

/**
 * Apply `transform` to the parts of `line` that are OUTSIDE inline code
 * spans, leaving code-span text (and its backticks) verbatim. Lets
 * emphasis/style fixers rewrite prose without corrupting literal markers
 * such as `reverse_proxy` inside `` `caddy reverse_proxy` ``.
 */
export function replaceOutsideInlineCode(line: string, transform: (segment: string) => string): string {
  let out = ''
  eachInlineSegment(line, seg => { out += transform(seg) }, (seg) => { out += seg })
  return out
}

/**
 * Blank out inline code spans (replacing every character — backticks and
 * content — with spaces) while preserving length and column positions. Used
 * by detectors that want to scan prose for markers without matching anything
 * inside a code span.
 */
export function maskInlineCode(line: string): string {
  let out = ''
  eachInlineSegment(line, (seg) => { out += seg }, (seg) => { out += ' '.repeat(seg.length) })
  return out
}
