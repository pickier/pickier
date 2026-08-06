import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines, maskInlineCode, replaceOutsideInlineCode } from './_fence-tracking'

/**
 * MD050 - Strong style
 *
 * Inline code spans are masked before anything is matched, the way its twin
 * `emphasis-style` already did. Without it a code span holding two double
 * underscores - `typeof __ctx === 'undefined' ? undefined : __ctx` is the real
 * case - reads as underscore-strong, so a document written entirely in
 * asterisks is reported as inconsistent on every `**bold**` after it.
 *
 * The warning was the harmless half. The fixer rewrote the same span into
 * `**ctx === 'undefined' ? undefined : **ctx`, which changes what the code
 * says - a formatter corrupting code it was asked to leave alone is a much
 * worse failure than a false positive.
 */
export const strongStyleRule: RuleModule = {
  meta: {
    docs: 'Strong style should be consistent (asterisk or underscore)',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    const options = (ctx.options as { style?: 'asterisk' | 'underscore' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'asterisk' | 'underscore' | null = null

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue

      // Masked rather than stripped, so the columns reported stay the columns
      // the reader would count.
      const line = maskInlineCode(lines[i])

      // Find double asterisk strong
      const asteriskMatches = line.matchAll(/\*\*([^*]+)\*\*/g)

      for (const match of asteriskMatches) {
        if (style === 'underscore') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/strong-style',
            message: 'Expected underscore (__) for strong',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'asterisk'
          }
          else if (detectedStyle === 'underscore') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: match.index! + 1,
              ruleId: 'markdown/strong-style',
              message: 'Strong style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }

      // Find double underscore strong
      const underscoreMatches = line.matchAll(/__([^_]+)__/g)

      for (const match of underscoreMatches) {
        if (style === 'asterisk') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/strong-style',
            message: 'Expected asterisk (**) for strong',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'underscore'
          }
          else if (detectedStyle === 'asterisk') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: match.index! + 1,
              ruleId: 'markdown/strong-style',
              message: 'Strong style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const options = (ctx.options as { style?: 'asterisk' | 'underscore' | 'consistent' }) || {}
    const style = options.style || 'consistent'
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    // Determine target style — only consider markers OUTSIDE code blocks
    // when picking the style to converge on, so a `**foo**` literal inside
    // a `` ```typescript `` example doesn't accidentally lock the document
    // to asterisks (or vice versa).
    let targetStyle: 'asterisk' | 'underscore' = 'asterisk'
    if (style === 'asterisk') {
      targetStyle = 'asterisk'
    }
    else if (style === 'underscore') {
      targetStyle = 'underscore'
    }
    else if (style === 'consistent') {
      // Find the earliest occurrence of each marker in non-code lines.
      // Track (line, column) so that when both appear on the same line we
      // still pick whichever comes first by character position — matching
      // the legacy behaviour `'**first** and __second__'` → asterisk.
      let firstAsterisk: { line: number, col: number } | null = null
      let firstUnderscore: { line: number, col: number } | null = null
      for (let i = 0; i < lines.length; i++) {
        if (inCode.has(i))
          continue
        const stripped = maskInlineCode(lines[i])
        if (firstAsterisk === null) {
          const m = stripped.match(/\*\*([^*]+)\*\*/)
          if (m)
            firstAsterisk = { line: i, col: m.index! }
        }
        if (firstUnderscore === null) {
          const m = stripped.match(/__([^_]+)__/)
          if (m)
            firstUnderscore = { line: i, col: m.index! }
        }
        if (firstAsterisk && firstUnderscore)
          break
      }
      const cmp = (a: { line: number, col: number }, b: { line: number, col: number }) =>
        a.line !== b.line ? a.line - b.line : a.col - b.col
      if (firstAsterisk && (!firstUnderscore || cmp(firstAsterisk, firstUnderscore) < 0))
        targetStyle = 'asterisk'
      else if (firstUnderscore)
        targetStyle = 'underscore'
    }

    // Apply the rewrite line-by-line so we can leave code-block lines
    // untouched, and inside each line leave inline code spans alone too.
    // Replacing across the full text would corrupt any literal `**`/`__`
    // markers inside fenced examples, and replacing across a whole line would
    // corrupt the ones inside backticks.
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const before = lines[i]
      const after = replaceOutsideInlineCode(before, seg =>
        targetStyle === 'asterisk'
          ? seg.replace(/__([^_]+)__/g, '**$1**')
          : seg.replace(/\*\*([^*]+)\*\*/g, '__$1__'))
      if (after !== before) {
        lines[i] = after
        changed = true
      }
    }
    return changed ? lines.join('\n') : text
  },
}
