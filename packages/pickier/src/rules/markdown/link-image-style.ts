import type { LintIssue, RuleModule } from '../../types'

/**
 * MD054 - Link and image style
 */
export const linkImageStyleRule: RuleModule = {
  meta: {
    docs: 'Link and image style should be consistent',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { style?: 'inline' | 'reference' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'inline' | 'reference' | null = null
    let inFence = false
    let inHtmlComment = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Track HTML comments
      if (line.includes('<!--'))
        inHtmlComment = true
      if (line.includes('-->')) {
        inHtmlComment = false
        continue
      }
      if (inHtmlComment)
        continue

      // Skip definition lines
      if (line.match(/^\[([^\]]+)\]:\s*\S+/)) {
        continue
      }

      // Check for inline links [text](url)
      const inlineMatches = line.matchAll(/\[[^\]]+\]\([^)]+\)/g)

      for (const match of inlineMatches) {
        if (style === 'reference') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/link-image-style',
            message: 'Expected reference style link',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'inline'
          }
          else if (detectedStyle === 'reference') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: match.index! + 1,
              ruleId: 'markdown/link-image-style',
              message: 'Link style should be consistent throughout document',
              severity: 'warning',
            })
          }
        }
      }

      // Check for reference links [text][label]
      const refMatches = line.matchAll(/\[[^\]]+\]\[([^\]]+)\]/g)

      for (const match of refMatches) {
        if (style === 'inline') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/link-image-style',
            message: 'Expected inline style link',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'reference'
          }
          else if (detectedStyle === 'inline') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: match.index! + 1,
              ruleId: 'markdown/link-image-style',
              message: 'Link style should be consistent throughout document',
              severity: 'warning',
            })
          }
        }
      }
    }

    return issues
  },
}
