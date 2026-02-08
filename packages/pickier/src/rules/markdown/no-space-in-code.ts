import type { LintIssue, RuleModule } from '../../types'

/**
 * MD038 - Spaces inside code span elements
 */
export const noSpaceInCodeRule: RuleModule = {
  meta: {
    docs: 'Code span elements should not have spaces inside the backticks',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Find code spans by matching balanced backtick groups (lazy match finds shortest span)
      const codeSpanPattern = /(`+)([\s\S]*?)\1/g
      for (const match of line.matchAll(codeSpanPattern)) {
        const content = match[2]
        // Only flag if content has both leading and trailing spaces and non-empty trimmed content
        if (content.startsWith(' ') && content.endsWith(' ') && content.trim().length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/no-space-in-code',
            message: 'Spaces inside code span elements',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    let inFence = false
    const result: string[] = []

    for (const line of lines) {
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        result.push(line)
        continue
      }
      if (inFence) {
        result.push(line)
        continue
      }

      // Fix spaces inside code spans
      result.push(line.replace(/(`+)([\s\S]*?)\1/g, (match, backticks: string, content: string) => {
        if (content.startsWith(' ') && content.endsWith(' ') && content.trim().length > 0)
          return `${backticks}${content.trim()}${backticks}`
        return match
      }))
    }

    return result.join('\n')
  },
}
