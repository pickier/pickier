import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

const punctuationEnd = /[.!?:;,]\s*$/

/**
 * Identify standalone bold/italic-only lines and return the inner text
 * (or null when the line isn't a faux heading). Centralised so `check`
 * and `fix` agree on what counts.
 */
function extractEmphasisHeading(line: string, prevLine: string, nextLine: string): string | null {
  const boldMatch = line.match(/^\*\*([^*]+)\*\*\s*$/) || line.match(/^__([^_]+)__\s*$/)
  const italicMatch = line.match(/^\*([^*]+)\*\s*$/) || line.match(/^_([^_]+)_\s*$/)
  const match = boldMatch || italicMatch
  if (!match)
    return null
  if (prevLine.trim().length !== 0 || nextLine.trim().length !== 0)
    return null
  const inner = match[1]
  if (punctuationEnd.test(inner))
    return null
  if (inner.trim().split(/\s+/).length >= 7)
    return null
  return inner
}

/**
 * MD036 - Emphasis used instead of a heading
 *
 * Flags standalone bold/italic lines that look like headings.
 * Matches markdownlint MD036 behavior: skips lines ending in punctuation
 * (., !, ?, :, ,, ;) since those are sentences/labels, not headings.
 */
export const noEmphasisAsHeadingRule: RuleModule = {
  meta: {
    docs: 'Emphasis should not be used for headings',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      if (extractEmphasisHeading(line, prevLine, nextLine) === null)
        continue
      issues.push({
        filePath: ctx.filePath,
        line: i + 1,
        column: 1,
        ruleId: 'markdown/no-emphasis-as-heading',
        message: 'Emphasis used instead of a heading',
        severity: 'warning',
      })
    }
    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)
    // Track the most recent ATX heading level so the rewrite picks a
    // sensible sub-level. (`**Foo**` under `## Bar` becomes `### Foo`.)
    // If we're before the first heading or the previous level is 6,
    // default to `###` rather than going past the legal range.
    let lastLevel = 2
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]
      const atx = line.match(/^(#{1,6})\s/)
      if (atx) {
        lastLevel = atx[1].length
        continue
      }
      const prevLine = i > 0 ? lines[i - 1] : ''
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      const inner = extractEmphasisHeading(line, prevLine, nextLine)
      if (inner === null)
        continue
      const level = Math.min(6, Math.max(2, lastLevel + 1))
      lines[i] = `${'#'.repeat(level)} ${inner.trim()}`
      changed = true
    }
    return changed ? lines.join('\n') : text
  },
}
