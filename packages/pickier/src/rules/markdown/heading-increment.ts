import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD001 - Heading levels should only increment by one level at a time
 */
export const headingIncrementRule: RuleModule = {
  meta: {
    docs: 'Heading levels should only increment by one level at a time',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)
    let previousLevel = 0

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]

      // Check for ATX style headings (#, ##, etc.)
      const atxMatch = line.match(/^(#{1,6})\s/)
      if (atxMatch) {
        const level = atxMatch[1].length

        if (previousLevel > 0 && level > previousLevel + 1) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/heading-increment',
            message: `Heading level should not skip from h${previousLevel} to h${level}`,
            severity: 'error',
          })
        }

        previousLevel = level
      }
    }

    return issues
  },
  /**
   * Auto-fix MD001 by walking through the document and clamping each
   * heading's level to (previous_emitted_level + 1) when the original
   * skipped a level. Going BACK up the tree (e.g. h3 → h2) is fine and
   * left untouched — only forward jumps are corrected.
   *
   * This is the canonical pattern for logsmith / changelog-style files
   * that emit:
   *
   *   # Changelog
   *   ### v1.0.0
   *   #### Features
   *
   * → rewritten to:
   *
   *   # Changelog
   *   ## v1.0.0
   *   ### Features
   *
   * The relative depth between the v1.0.0 and Features headings is
   * preserved (both demoted by 1), so the document hierarchy stays
   * intact.
   */
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)
    let previousLevel = 0
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]
      const atxMatch = line.match(/^(#{1,6})(\s.*)$/)
      if (!atxMatch)
        continue
      const original = atxMatch[1].length
      const allowed = previousLevel === 0 ? original : Math.min(original, previousLevel + 1)
      if (allowed !== original) {
        lines[i] = '#'.repeat(allowed) + atxMatch[2]
        changed = true
      }
      previousLevel = allowed
    }
    return changed ? lines.join('\n') : text
  },
}
