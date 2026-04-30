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
