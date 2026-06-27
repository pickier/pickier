import type { LintIssue, RuleModule } from '../../types'

/**
 * MD032 - Lists should be surrounded by blank lines
 */
export const blanksAroundListsRule: RuleModule = {
  meta: {
    docs: 'Lists should be surrounded by blank lines',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    let inList = false
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        if (inList)
          inList = false
        continue
      }
      if (inFence)
        continue

      // Check if this is a list item or a continuation of one (indented text following a list item)
      const isListItem = /^(?:\s*)(?:[*\-+]|\d+\.)\s+/.test(line)
      const isListContinuation = inList && !isListItem && line.trim().length > 0 && /^\s+/.test(line)

      if (isListItem && !inList) {
        // Start of a new list
        inList = true

        // Check if previous line exists and is not blank
        if (i > 0 && prevLine.trim().length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/blanks-around-lists',
            message: 'Lists should be surrounded by blank lines',
            severity: 'error',
          })
        }
      }
      else if (!isListItem && !isListContinuation && inList && line.trim().length > 0) {
        // End of list (non-blank, non-list, non-continuation line)
        inList = false

        // Check if previous line was a list item
        const prevLineIsListItem = /^(?:\s*)(?:[*\-+]|\d+\.)\s+/.test(prevLine)
        if (prevLineIsListItem) {
          issues.push({
            filePath: ctx.filePath,
            line: i,
            column: 1,
            ruleId: 'markdown/blanks-around-lists',
            message: 'Lists should be surrounded by blank lines',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const result: string[] = []
    let inList = false
    let inFence = false

    const isListItemLine = (l: string) => /^(?:\s*)(?:[*\-+]|\d+\.)\s+/.test(l)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''

      // Fenced code blocks: pass through verbatim and close any open list.
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        inList = false
        result.push(line)
        continue
      }
      if (inFence) {
        result.push(line)
        continue
      }

      const isListItem = isListItemLine(line)
      const isBlank = line.trim().length === 0
      // An indented, non-blank line under a list item is a continuation of it
      // (e.g. a wrapped paragraph or nested content) — NOT the end of the list.
      const isContinuation = inList && !isListItem && !isBlank && /^\s/.test(line)

      if (isListItem && !inList) {
        // Start of list - add blank line before if needed
        if (i > 0 && prevLine.trim().length > 0 && result.length > 0) {
          result.push('')
        }
        inList = true
      }
      else if (!isListItem && !isContinuation && !isBlank && inList) {
        // End of list - add blank line before next content
        inList = false
        if (result.length > 0) {
          result.push('')
        }
      }
      else if (isBlank) {
        // Blank line might end the list — it stays a list only if the next
        // non-blank line is another item or a continuation of one.
        const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
        const nextIsListItem = isListItemLine(nextLine)
        const nextIsContinuation = /^\s+\S/.test(nextLine)
        if (!nextIsListItem && !nextIsContinuation && inList) {
          inList = false
        }
      }

      result.push(line)
    }

    return result.join('\n')
  },
}
