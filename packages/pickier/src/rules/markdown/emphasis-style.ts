import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines, maskInlineCode, maskInlineCodeAcrossLines, replaceOutsideInlineCode } from './_fence-tracking'

// Single-marker emphasis (not the double `**`/`__` of strong), matched only
// outside code. `[^*]`/`[^_]` keeps a match from spanning across a `**`/`__`.

/**
 * Asterisk emphasis, excluding the whitespace-flanked case CommonMark excludes.
 *
 * A `*` cannot open emphasis when whitespace follows it, and cannot close one
 * when whitespace precedes it. Without that, a line mentioning two globs or
 * wildcards - `rebrand VP* design-system class prefix to BP*` - reads as one
 * asterisk-emphasised span running between them. The document is then judged
 * to use asterisk style, and its genuine `_..._` emphasis is reported as
 * inconsistent: a warning about the one thing on the line that was correct.
 *
 * This is the asterisk counterpart of the intraword rule below, and the same
 * kind of writing produces it - prose naming a pattern, a version glob or a
 * class prefix without wrapping it in a code span.
 */
const ASTERISK_EMPHASIS_SOURCE = '(?<!\\*)\\*(?!\\*)(?!\\s)([^*]*[^*\\s])\\*(?!\\*)'
const ASTERISK_EMPHASIS = new RegExp(ASTERISK_EMPHASIS_SOURCE)

/**
 * Underscore emphasis, excluding the intraword case CommonMark excludes.
 *
 * `_` cannot open emphasis when it follows an alphanumeric, and cannot close
 * one when an alphanumeric follows it - which is the rule that makes
 * `snake_case_names` ordinary text rather than emphasis. Without the
 * lookarounds, a line of prose listing
 * `review_requested, mentioned, watching, team_mention` reads as one
 * underscore-emphasised span from the first `_` to the last, and gets reported
 * as inconsistent with the asterisks everywhere else.
 *
 * That is the single most common false positive this rule can produce, because
 * technical writing is full of identifiers and most of them are not in code
 * spans - a sentence naming a column or an enum value writes it bare.
 */
const UNDERSCORE_EMPHASIS_SOURCE = '(?<![A-Za-z0-9_])_(?!_)([^_]+)_(?![A-Za-z0-9_])'
const UNDERSCORE_EMPHASIS = new RegExp(UNDERSCORE_EMPHASIS_SOURCE)

/**
 * MD049 - Emphasis style
 */
export const emphasisStyleRule: RuleModule = {
  meta: {
    docs: 'Emphasis style should be consistent (asterisk or underscore)',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { style?: 'asterisk' | 'underscore' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'asterisk' | 'underscore' | null = null
    // CommonMark-compliant tracking, same as fix() — the naive per-line
    // toggle miscounts fence-looking CONTENT lines (```js inside ~~~)
    const inCode = getCodeBlockLines(lines)

    /*
     * Masked across the whole document rather than line by line.
     *
     * An inline code span may legally wrap a line inside a paragraph, and per
     * line neither half has a balanced pair of backticks - so nothing was
     * masked and the underscores in something like
     * `` `REVIEWOS_GPG_TESTS=1 bun\ntest ...` `` read as underscore emphasis,
     * reported as inconsistent with the asterisks everywhere else. Prose
     * wrapped at eighty columns produces this constantly, and it is invisible
     * to whoever reads the source because it renders correctly.
     */
    const masked = maskInlineCodeAcrossLines(lines)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (inCode.has(i))
        continue

      // Length-preserving, so columns stay valid.
      const stripped = masked[i] ?? maskInlineCode(line)

      // Find single asterisk emphasis (not double **)
      const asteriskMatches = stripped.matchAll(new RegExp(ASTERISK_EMPHASIS_SOURCE, 'g'))

      for (const match of asteriskMatches) {
        if (style === 'underscore') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/emphasis-style',
            message: 'Expected underscore (_) for emphasis',
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
              ruleId: 'markdown/emphasis-style',
              message: 'Emphasis style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }

      // Find single underscore emphasis (not double __)
      const underscoreMatches = stripped.matchAll(new RegExp(UNDERSCORE_EMPHASIS_SOURCE, 'g'))

      for (const match of underscoreMatches) {
        if (style === 'asterisk') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/emphasis-style',
            message: 'Expected asterisk (*) for emphasis',
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
              ruleId: 'markdown/emphasis-style',
              message: 'Emphasis style should be consistent throughout document',
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

    // Determine the target style — only from markers OUTSIDE code blocks and
    // inline code spans, so a literal `_` in `` `reverse_proxy` `` (or a
    // `*foo*` in a fenced example) can't decide the document's style.
    let targetStyle: 'asterisk' | 'underscore' = 'asterisk'
    if (style === 'asterisk') {
      targetStyle = 'asterisk'
    }
    else if (style === 'underscore') {
      targetStyle = 'underscore'
    }
    else if (style === 'consistent') {
      let firstAsterisk: { line: number, col: number } | null = null
      let firstUnderscore: { line: number, col: number } | null = null
      for (let i = 0; i < lines.length; i++) {
        if (inCode.has(i))
          continue
        const stripped = maskInlineCode(lines[i])
        if (firstAsterisk === null) {
          const m = stripped.match(ASTERISK_EMPHASIS)
          if (m)
            firstAsterisk = { line: i, col: m.index! }
        }
        if (firstUnderscore === null) {
          const m = stripped.match(UNDERSCORE_EMPHASIS)
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

    // Rewrite line-by-line, skipping code-block lines entirely and inline
    // code spans within each line. Replacing across the whole text would pair
    // a lone `_` on one line with a lone `_` lines later and corrupt both.
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const after = replaceOutsideInlineCode(lines[i], seg =>
        targetStyle === 'asterisk'
          ? seg.replace(new RegExp(UNDERSCORE_EMPHASIS_SOURCE, 'g'), '*$1*')
          : seg.replace(new RegExp(ASTERISK_EMPHASIS_SOURCE, 'g'), '_$1_'))
      if (after !== lines[i]) {
        lines[i] = after
        changed = true
      }
    }

    return changed ? lines.join('\n') : text
  },
}
