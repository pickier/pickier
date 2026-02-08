import type { LintIssue, RuleModule } from '../../types'

/**
 * MD024 - Multiple headings with the same content
 */
export const noDuplicateHeadingRule: RuleModule = {
  meta: {
    docs: 'Multiple headings should not have the same content',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const headings = new Map<string, number>()
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

      // Check for ATX style headings
      const atxMatch = line.match(/^#{1,6}\s+(.+?)(?:\s*#+\s*)?$/)
      if (atxMatch) {
        const content = atxMatch[1].trim()

        if (headings.has(content)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/no-duplicate-heading',
            message: `Duplicate heading "${content}" (first occurrence on line ${headings.get(content)})`,
            severity: 'error',
          })
        }
        else {
          headings.set(content, i + 1)
        }
      }

      // Check for Setext style headings
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      if (/^(=+|-+)\s*$/.test(nextLine) && line.trim().length > 0) {
        const content = line.trim()

        if (headings.has(content)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/no-duplicate-heading',
            message: `Duplicate heading "${content}" (first occurrence on line ${headings.get(content)})`,
            severity: 'error',
          })
        }
        else {
          headings.set(content, i + 1)
        }
      }
    }

    return issues
  },
}
