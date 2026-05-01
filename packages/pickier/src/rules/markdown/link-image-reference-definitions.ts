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
  /**
   * Auto-fix MD053 by removing reference definition lines whose label
   * isn't used anywhere else in the document. Pairs with MD054's
   * reference→inline rewrite (which leaves definitions behind on
   * purpose) so a single `--fix` pass cleans up both.
   *
   * Safety: skips lines inside code blocks. Trailing blank lines
   * left by removed definitions are handled by no-multiple-blanks /
   * single-trailing-newline in subsequent fixer passes.
   */
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    // Collect definition lines: index → label.
    const defLines = new Map<number, string>()
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const m = lines[i].match(/^\s*\[([^\]]+)\]:\s*\S+/)
      if (m)
        defLines.set(i, m[1].toLowerCase())
    }
    if (defLines.size === 0)
      return text

    // Collect all usages outside definition lines.
    const usages = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      if (defLines.has(i))
        continue
      const line = lines[i]
      // [text][label] and [label] (shortcut form)
      const refMatches = line.matchAll(/\[([^\]]+)\](?:\[([^\]]*)\])?(?!\()/g)
      for (const m of refMatches) {
        const label = (m[2] && m[2].length > 0 ? m[2] : m[1]).toLowerCase()
        usages.add(label)
      }
    }

    // Find the indices to drop and remove them.
    const toRemove = new Set<number>()
    for (const [idx, label] of defLines) {
      if (!usages.has(label))
        toRemove.add(idx)
    }
    if (toRemove.size === 0)
      return text

    return lines.filter((_, idx) => !toRemove.has(idx)).join('\n')
  },
}
