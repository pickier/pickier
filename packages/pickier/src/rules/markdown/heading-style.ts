import type { LintIssue, RuleModule } from '../../types'

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

    // Default to 'consistent' style
    const options = (ctx.options as { style?: 'atx' | 'setext' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'atx' | 'setext' | null = null
    let fenceChar: '`' | '~' | null = null
    let fenceLen = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      const fenceMatch = line.trim().match(/^(`{3,}|~{3,})/)
      if (fenceMatch) {
        const run = fenceMatch[1]
        const ch = run[0] as '`' | '~'
        if (fenceChar === null) {
          fenceChar = ch
          fenceLen = run.length
        }
        else if (ch === fenceChar && run.length >= fenceLen) {
          fenceChar = null
          fenceLen = 0
        }
        continue
      }
      if (fenceChar !== null)
        continue

      // Check for ATX style headings (#, ##, etc.)
      const atxMatch = line.match(/^#{1,6}\s/)

      // Check for Setext style headings (underlined with = or -)
      const setextMatch = nextLine.match(/^(?:=+|-+)\s*$/) && line.trim().length > 0

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
}
