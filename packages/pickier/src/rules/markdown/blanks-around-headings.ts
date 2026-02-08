import type { LintIssue, RuleModule } from '../../types'

/**
 * MD022 - Headings should be surrounded by blank lines
 */
export const blanksAroundHeadingsRule: RuleModule = {
  meta: {
    docs: 'Headings should be surrounded by blank lines',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFencedCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      // Track fenced code blocks to avoid false positives on comments like `# comment`
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFencedCodeBlock = !inFencedCodeBlock
        continue
      }

      if (inFencedCodeBlock)
        continue

      // Check for ATX style headings
      const isAtxHeading = /^#{1,6}\s/.test(line)

      // Check for Setext style headings (next line is = or -)
      const isSetextHeading = i + 1 < lines.length && /^(=+|-+)\s*$/.test(nextLine) && line.trim().length > 0

      if (isAtxHeading) {
        // Check if previous line exists and is not blank (unless it's the first line)
        if (i > 0 && prevLine.trim().length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/blanks-around-headings',
            message: 'Headings should be surrounded by blank lines',
            severity: 'error',
          })
        }

        // Check if next line exists and is not blank (unless it's the last line)
        if (i + 1 < lines.length && nextLine.trim().length > 0 && !/^#{1,6}\s/.test(nextLine)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/blanks-around-headings',
            message: 'Headings should be surrounded by blank lines',
            severity: 'error',
          })
        }
      }

      if (isSetextHeading) {
        // Check previous line (line before the heading text)
        if (i > 0 && prevLine.trim().length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/blanks-around-headings',
            message: 'Headings should be surrounded by blank lines',
            severity: 'error',
          })
        }

        // Check line after the underline
        const lineAfterUnderline = i + 2 < lines.length ? lines[i + 2] : ''
        if (i + 2 < lines.length && lineAfterUnderline.trim().length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/blanks-around-headings',
            message: 'Headings should be surrounded by blank lines',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const result: string[] = []
    let inFencedCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFencedCodeBlock = !inFencedCodeBlock
        result.push(line)
        continue
      }

      if (inFencedCodeBlock) {
        result.push(line)
        continue
      }

      const isAtxHeading = /^#{1,6}\s/.test(line)
      const isSetextHeading = i + 1 < lines.length && /^(=+|-+)\s*$/.test(nextLine) && line.trim().length > 0

      // Add blank line before heading if needed
      if (isAtxHeading || isSetextHeading) {
        if (i > 0 && prevLine.trim().length > 0 && result.length > 0) {
          result.push('')
        }
      }

      result.push(line)

      // Add blank line after ATX heading if needed
      if (isAtxHeading) {
        if (i + 1 < lines.length && nextLine.trim().length > 0 && !/^#{1,6}\s/.test(nextLine)) {
          result.push('')
        }
      }

      // Add blank line after Setext heading underline if needed
      if (i > 0 && /^(=+|-+)\s*$/.test(line) && lines[i - 1].trim().length > 0) {
        const lineAfterUnderline = i + 1 < lines.length ? lines[i + 1] : ''
        if (lineAfterUnderline.trim().length > 0) {
          result.push('')
        }
      }
    }

    return result.join('\n')
  },
}
