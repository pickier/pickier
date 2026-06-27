import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines, maskInlineCode, replaceOutsideInlineCode } from './_fence-tracking'

// Single-marker emphasis (not the double `**`/`__` of strong), matched only
// outside code. `[^*]`/`[^_]` keeps a match from spanning across a `**`/`__`.
const ASTERISK_EMPHASIS = /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/
const UNDERSCORE_EMPHASIS = /(?<!_)_(?!_)([^_]+)_(?!_)/

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
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Strip inline code spans to avoid matching emphasis markers inside code
      const stripped = line.replace(/``[^`]+``/g, '  ').replace(/`[^`]+`/g, ' ')

      // Find single asterisk emphasis (not double **)
      const asteriskMatches = stripped.matchAll(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g)

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
      const underscoreMatches = stripped.matchAll(/(?<!_)_(?!_)([^_]+)_(?!_)/g)

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
          ? seg.replace(/(?<!_)_(?!_)([^_]+)_(?!_)/g, '*$1*')
          : seg.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '_$1_'))
      if (after !== lines[i]) {
        lines[i] = after
        changed = true
      }
    }

    return changed ? lines.join('\n') : text
  },
}
