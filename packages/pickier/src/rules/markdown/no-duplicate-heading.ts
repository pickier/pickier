import type { LintIssue, RuleModule } from '../../types'

/**
 * MD024 - Multiple headings with the same content
 *
 * Uses "siblings only" mode by default: only flags duplicate headings
 * within the same parent section. This avoids false positives in
 * changelogs and other documents where headings naturally repeat
 * across different sections (e.g., each version has "Features", "Fixes").
 */
export const noDuplicateHeadingRule: RuleModule = {
  meta: {
    docs: 'Multiple headings should not have the same content',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let inFence = false

    // Track headings per parent section (siblings-only mode)
    // Key: parent heading content + level, Value: Map of child heading content to first line number
    // Each heading level maintains a stack of seen headings that resets when a same-or-higher level heading appears
    const headingsByLevel: Map<string, number>[] = Array.from({ length: 7 }, () => new Map())

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      let content: string | null = null
      let level = 0

      // Check for ATX style headings
      const atxMatch = line.match(/^(#{1,6})\s+(.+?)(?:\s*#+\s*)?$/)
      if (atxMatch) {
        level = atxMatch[1].length
        content = atxMatch[2].trim()
      }

      // Check for Setext style headings
      if (!content) {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
        if (/^(=+)\s*$/.test(nextLine) && line.trim().length > 0) {
          level = 1
          content = line.trim()
        }
        else if (/^(-+)\s*$/.test(nextLine) && line.trim().length > 0) {
          level = 2
          content = line.trim()
        }
      }

      if (!content || level === 0)
        continue

      // When we encounter a heading at level N, clear all heading maps for levels > N
      // This resets sibling tracking for child sections
      for (let l = level + 1; l <= 6; l++) {
        headingsByLevel[l].clear()
      }

      // Check for duplicate among siblings (same level under same parent)
      const siblings = headingsByLevel[level]
      if (siblings.has(content)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: 1,
          ruleId: 'markdown/no-duplicate-heading',
          message: `Duplicate heading "${content}" (first occurrence on line ${siblings.get(content)})`,
          severity: 'error',
        })
      }
      else {
        siblings.set(content, i + 1)
      }
    }

    return issues
  },
}
