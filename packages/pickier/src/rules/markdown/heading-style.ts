import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD003 - Heading style
 */
export const headingStyleRule: RuleModule = {
  meta: {
    docs: 'Heading style should be consistent (atx, setext, or consistent)',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { style?: 'atx' | 'setext' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'atx' | 'setext' | null = null
    // Use a CommonMark-compliant code-block tracker so YAML examples
    // inside `` ```yaml ... ``` `` and indented code blocks aren't
    // mistaken for setext headings (`text\n---` is heading-like syntax
    // outside of code, but content inside).
    const inCode = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      const atxMatch = line.match(/^#{1,6}\s/)
      const setextMatch = nextLine.match(/^(?:=+|-+)\s*$/) && line.trim().length > 0 && !inCode.has(i + 1)

      if (atxMatch) {
        if (style === 'setext') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/heading-style',
            message: 'Expected setext style heading',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'atx'
          }
          else if (detectedStyle === 'setext') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/heading-style',
              message: 'Heading style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }
      else if (setextMatch) {
        if (style === 'atx') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/heading-style',
            message: 'Expected atx style heading',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'setext'
          }
          else if (detectedStyle === 'atx') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/heading-style',
              message: 'Heading style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const options = (ctx.options as { style?: 'atx' | 'setext' | 'consistent' }) || {}
    const style = options.style || 'consistent'
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    // Determine the target style.
    //  - explicit `atx` / `setext`: that's the target.
    //  - `consistent`: the first heading's style (matching `check`).
    let target: 'atx' | 'setext' | null = style === 'consistent' ? null : style
    if (target === null) {
      for (let i = 0; i < lines.length; i++) {
        if (inCode.has(i))
          continue
        const line = lines[i]
        const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
        if (/^#{1,6}\s/.test(line)) { target = 'atx'; break }
        if (/^(?:=+|-+)\s*$/.test(nextLine) && line.trim().length > 0 && !inCode.has(i + 1)) {
          target = 'setext'
          break
        }
      }
    }
    if (target === null)
      return text

    const result: string[] = []
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Inside a code block — never rewrite (avoids corrupting YAML
      // examples and the like).
      if (inCode.has(i)) {
        result.push(line)
        continue
      }
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      // setext → atx: collapse `Title\n===` (level 1) or `Title\n---` (level 2)
      if (target === 'atx') {
        const setextEq = /^=+\s*$/.test(nextLine)
        const setextDash = /^-+\s*$/.test(nextLine)
        const nextIsCode = inCode.has(i + 1)
        if ((setextEq || setextDash) && !nextIsCode && line.trim().length > 0 && !/^#{1,6}\s/.test(line)) {
          const hashes = setextEq ? '#' : '##'
          result.push(`${hashes} ${line.trim()}`)
          i++ // skip the underline
          changed = true
          continue
        }
      }
      // atx → setext: only levels 1 and 2 can be represented as setext.
      if (target === 'setext') {
        const atx = line.match(/^(#{1,2})\s+(.+?)\s*#*\s*$/)
        if (atx) {
          const level = atx[1].length
          const title = atx[2]
          const underline = (level === 1 ? '=' : '-').repeat(Math.max(3, title.length))
          result.push(title)
          result.push(underline)
          changed = true
          continue
        }
      }
      result.push(line)
    }
    return changed ? result.join('\n') : text
  },
}
