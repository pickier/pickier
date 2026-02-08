import type { LintIssue, RuleModule } from '../../types'

/**
 * MD007 - Unordered list indentation
 */
export const ulIndentRule: RuleModule = {
  meta: {
    docs: 'Unordered list indentation should be consistent',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { indent?: number }) || {}
    const expectedIndent = options.indent || 2
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

      // Check for unordered list item
      const match = line.match(/^(\s*)([*\-+])\s+/)

      if (match) {
        const indent = match[1].length

        // Check if indent is a multiple of expected indent
        if (indent > 0 && indent % expectedIndent !== 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/ul-indent',
            message: `Unordered list indentation should be ${expectedIndent} spaces per level. Found ${indent} spaces`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
