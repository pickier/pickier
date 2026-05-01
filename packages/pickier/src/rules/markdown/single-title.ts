import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD025 - Multiple top-level headings in the same document
 */
export const singleTitleRule: RuleModule = {
  meta: {
    docs: 'Document should have only one top-level heading (h1)',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)
    let firstH1Line = -1

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      let isH1 = false
      if (/^#\s/.test(line))
        isH1 = true
      if (/^=+\s*$/.test(nextLine) && line.trim().length > 0 && !inCode.has(i + 1))
        isH1 = true

      if (isH1) {
        if (firstH1Line === -1) {
          firstH1Line = i + 1
        }
        else {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/single-title',
            message: `Multiple top-level headings in the same document (first h1 on line ${firstH1Line})`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  /**
   * Auto-fix MD025 by demoting subsequent h1 headings to h2. The first
   * h1 stays as-is (it's the title); duplicates get an extra `#`.
   *
   * Setext-style h1 (`Title\n===`) is converted to ATX h2 (`## Title`)
   * so the underline doesn't have to be rewritten — and so callers
   * mixing styles don't end up with `Title\n--` (which would be a setext
   * h2 but visually different from `## Title`).
   *
   * Code-block lines are skipped via the shared tracker so an h1 inside
   * a `` ```markdown `` example isn't accidentally demoted.
   */
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)
    const result: string[] = []
    let seenH1 = false
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i)) {
        result.push(lines[i])
        continue
      }
      const line = lines[i]
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      const atxH1 = /^#\s/.test(line)
      const setextH1 = /^=+\s*$/.test(nextLine) && line.trim().length > 0 && !inCode.has(i + 1)
      if (atxH1) {
        if (!seenH1) {
          seenH1 = true
          result.push(line)
        }
        else {
          // Demote: `# Title` → `## Title`
          result.push(`#${line}`)
          changed = true
        }
        continue
      }
      if (setextH1) {
        if (!seenH1) {
          seenH1 = true
          result.push(line)
          continue
        }
        // Convert setext h1 to ATX h2: emit `## title` and skip the underline.
        result.push(`## ${line.trim()}`)
        i++ // skip the `===` line
        changed = true
        continue
      }
      result.push(line)
    }
    return changed ? result.join('\n') : text
  },
}
