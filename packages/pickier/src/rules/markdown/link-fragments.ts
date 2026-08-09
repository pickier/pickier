import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * GitHub's heading slug, which is the one the links have to match.
 *
 * Each whitespace character becomes its own hyphen. Collapsing runs with
 * `\s+` looks equivalent and is not: punctuation is stripped *before* this
 * step, so `fixes — at` loses the em-dash and leaves two spaces, which GitHub
 * turns into `fixes--at`. Collapsing produced `fixes-at`, so every heading
 * containing a dash or slash between words was reported as a broken anchor
 * while the link worked perfectly on GitHub -- the rule was wrong about
 * correct documents, which is the worst way for a linter to be wrong.
 */
function slug(headingText: string): string {
  return headingText
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-')
}

/**
 * MD051 - Link fragments should be valid
 */
export const linkFragmentsRule: RuleModule = {
  meta: {
    docs: 'Link fragments should reference valid headings',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    // Collect all heading IDs (skipping code-block lines so example
    // headings inside ```markdown ... ``` aren't treated as real anchors).
    const headingIds = new Set<string>()

    for (let li = 0; li < lines.length; li++) {
      if (inCode.has(li))
        continue
      const line = lines[li]
      const atxMatch = line.match(/^#{1,6}\s+(.+?)(?:\s*#+\s*)?$/)
      if (atxMatch) {
        const headingText = atxMatch[1].trim()
        headingIds.add(slug(headingText))
      }
    }

    // Check for fragment links
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]

      // Find fragment links [text](#fragment)
      const matches = line.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)

      for (const match of matches) {
        const fragment = match[1]

        if (!headingIds.has(fragment)) {
          const column = match.index! + 1
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column,
            ruleId: 'markdown/link-fragments',
            message: `Link fragment '#${fragment}' does not match any heading`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
