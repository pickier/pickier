import type { LintIssue, RuleModule } from '../../types'

/**
 * MD045 - Images should have alternate text (alt text)
 */
export const noAltTextRule: RuleModule = {
  meta: {
    docs: 'Images should have alternate text',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    let inFence = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) { inFence = !inFence; continue }
      if (inFence) continue

      // Strip inline code spans
      const stripped = line.replace(/``[^`]+``/g, m => ' '.repeat(m.length)).replace(/`[^`]+`/g, m => ' '.repeat(m.length))

      // Check for images with empty alt text ![](url)
      const emptyAltMatches = stripped.matchAll(/!\[\s*\]\([^)]+\)/g)

      for (const match of emptyAltMatches) {
        const column = match.index! + 1
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column,
          ruleId: 'markdown/no-alt-text',
          message: 'Images should have alternate text (alt text)',
          severity: 'error',
        })
      }
    }

    return issues
  },
}
