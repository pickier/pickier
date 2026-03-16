import type { LintIssue, RuleModule } from '../../types'

/**
 * MD040 - Fenced code blocks should have a language specified
 */
export const fencedCodeLanguageRule: RuleModule = {
  meta: {
    docs: 'Fenced code blocks should have a language specified',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for code fence without language
      const match = line.match(/^(?:`{3,}|~{3,})\s*$/)

      if (match) {
        // Check if this is an opening fence (not closing)
        let isOpening = true
        for (let j = i - 1; j >= 0; j--) {
          if (/^(?:`{3,}|~{3,})/.test(lines[j])) {
            isOpening = false
            break
          }
        }

        if (isOpening) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/fenced-code-language',
            message: 'Fenced code blocks should have a language specified',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
