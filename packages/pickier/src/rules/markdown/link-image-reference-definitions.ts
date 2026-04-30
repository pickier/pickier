import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD053 - Link and image reference definitions should be needed
 */
export const linkImageReferenceDefinitionsRule: RuleModule = {
  meta: {
    docs: 'Link and image reference definitions should be used',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    // Collect all reference definitions [label]: url
    const definitions = new Map<string, number>()

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]
      const defMatch = line.match(/^\[([^\]]+)\]:\s*\S+/)
      if (defMatch) {
        definitions.set(defMatch[1].toLowerCase(), i + 1)
      }
    }

    // Collect all reference usages
    const usages = new Set<string>()

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]
      // Skip definition lines
      if (line.match(/^\[(?:[^\]]+)\]:\s*\S+/)) {
        continue
      }

      // Find reference links [text][label] or [label]
      const linkMatches = line.matchAll(/\[([^\]]+)\](?:\[([^\]]+)\])?(?!\()/g)

      for (const match of linkMatches) {
        const label = (match[2] || match[1]).toLowerCase()
        usages.add(label)
      }
    }

    // Check for unused definitions
    for (const [label, lineNum] of definitions) {
      if (!usages.has(label)) {
        issues.push({
          filePath: ctx.filePath,
          line: lineNum,
          column: 1,
          ruleId: 'markdown/link-image-reference-definitions',
          message: `Unused reference definition '[${label}]'`,
          severity: 'warning',
        })
      }
    }

    return issues
  },
}
