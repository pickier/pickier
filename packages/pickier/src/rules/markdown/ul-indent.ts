import type { LintIssue, RuleModule } from '../../types'

/**
 * MD007 - Unordered list indentation
 *
 * Tracks list-nesting context to correctly handle nested lists, including
 * lists nested inside ordered list items (where indentation must align
 * with the content after the ordered marker, e.g. 3 spaces after "1. ").
 *
 * Matches markdownlint MD007 behavior: only top-level unordered lists and
 * their descendants nested under other unordered lists are checked against
 * the fixed indent. Lists nested inside ordered items may use any indent
 * that aligns with the parent's content column.
 */
export const ulIndentRule: RuleModule = {
  meta: {
    docs: 'Unordered list indentation should be consistent',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { indent?: number }) || {}
    const expectedIndent = options.indent || 2
    let inFence = false

    // Stack of list items we're currently nested inside.
    // Each entry: { indent: column where the item starts, contentCol: column where content begins, type: 'ul' | 'ol' }
    interface ListContext {
      indent: number
      contentCol: number
      type: 'ul' | 'ol'
    }
    const stack: ListContext[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Skip blank lines (don't pop stack — blanks can appear within lists)
      if (line.trim() === '')
        continue

      // Detect list items
      const ulMatch = line.match(/^(\s*)([*\-+])(\s+)/)
      const olMatch = line.match(/^(\s*)(\d+[.)])(\s+)/)

      if (!ulMatch && !olMatch) {
        // Non-list line: if indent is less than top of stack, pop stack entries
        // that are at or deeper than this indent
        const lineIndent = line.match(/^(\s*)/)?.[1].length || 0
        while (stack.length > 0 && stack[stack.length - 1].contentCol > lineIndent)
          stack.pop()
        continue
      }

      const match = ulMatch || olMatch!
      const indent = match[1].length
      const marker = match[2]
      const afterMarker = match[3]
      const contentCol = indent + marker.length + afterMarker.length
      const type: 'ul' | 'ol' = ulMatch ? 'ul' : 'ol'

      // Pop stack entries that this item is NOT nested inside of.
      // An item is nested inside a parent if its indent >= parent's contentCol.
      while (stack.length > 0 && indent < stack[stack.length - 1].contentCol)
        stack.pop()

      // Validate indentation for unordered list items only
      if (type === 'ul') {
        const parent = stack.length > 0 ? stack[stack.length - 1] : null

        if (!parent) {
          // Top-level ul item: must have 0 indent (or multiple of expectedIndent if inside something else)
          if (indent !== 0 && indent % expectedIndent !== 0) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/ul-indent',
              message: `Unordered list indentation should be ${expectedIndent} spaces per level. Found ${indent} spaces`,
              severity: 'error',
            })
          }
        }
        else if (parent.type === 'ul') {
          // Nested under a ul: indent should be parent.contentCol (standard nesting)
          // or parent.indent + expectedIndent
          const expected1 = parent.contentCol
          const expected2 = parent.indent + expectedIndent
          if (indent !== expected1 && indent !== expected2) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'markdown/ul-indent',
              message: `Unordered list indentation should be ${expectedIndent} spaces per level. Found ${indent} spaces`,
              severity: 'error',
            })
          }
        }
        // If parent is ol, any indent that nests is valid (3 for "1. ", 4 for "10. ", etc.)
        // Don't flag since the expected indent varies based on ol marker width.
      }

      // Push this item onto the stack
      stack.push({ indent, contentCol, type })
    }

    return issues
  },
}
