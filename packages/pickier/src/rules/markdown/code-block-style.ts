import type { LintIssue, RuleModule } from '../../types'

/**
 * MD046 - Code block style
 */
export const codeBlockStyleRule: RuleModule = {
  meta: {
    docs: 'Code block style should be consistent',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { style?: 'fenced' | 'indented' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'fenced' | 'indented' | null = null
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for fenced code block marker (opening or closing)
      const isFenced = /^(`{3,}|~{3,})/.test(line)

      if (isFenced) {
        // Toggle fence state
        inFence = !inFence

        if (style === 'indented') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/code-block-style',
            message: 'Expected indented code block style',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'fenced'
          }
          else if (detectedStyle === 'indented') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/code-block-style',
              message: 'Code block style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
        continue
      }

      // Skip lines inside fenced code blocks - indented content
      // inside a fence is not an "indented code block"
      if (inFence) {
        continue
      }

      // Check for indented code block (4 spaces or tab)
      const isIndented = /^( {4}|\t)/.test(line) && line.trim().length > 0

      if (isIndented) {
        // Need to verify it's actually a code block, not just indented text in a list
        const prevLine = i > 0 ? lines[i - 1] : ''
        const isAfterBlankLine = prevLine.trim().length === 0 || i === 0

        if (isAfterBlankLine && style === 'fenced') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/code-block-style',
            message: 'Expected fenced code block style',
            severity: 'error',
          })
        }
        else if (isAfterBlankLine && style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'indented'
          }
          else if (detectedStyle === 'fenced') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/code-block-style',
              message: 'Code block style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
}
