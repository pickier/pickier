import type { RuleModule } from '../../types'

// Heuristic: flag 'await' only when at top level (brace depth 0),
// outside of comments/strings/templates, and not part of 'for await'.
export const noTopLevelAwaitRule: RuleModule = {
  meta: { docs: 'Disallow top-level await in TypeScript/JavaScript files' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const ext = ctx.filePath.split('.').pop() || ''
    if (!['ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs'].includes(ext))
      return issues

    let depth = 0
    let inBlock = false
    let inLine = false
    let inSQ = false
    let inDQ = false
    let inTQ = false
    let escape = false
    let col = 0
    let lineNo = 1

    const pushIssue = (column: number) => {
      issues.push({ filePath: ctx.filePath, line: lineNo, column, ruleId: 'ts/no-top-level-await', message: 'Do not use top-level await', severity: 'error' })
    }

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      col++
      const next = text[i + 1]

      // newline handling
      if (ch === '\n') {
        inLine = false
        lineNo++
        col = 0
        continue
      }

      if (inLine)
        continue

      // block comments
      if (inBlock) {
        if (ch === '*' && next === '/') {
          inBlock = false
          i++
          col++
        }
        continue
      }

      // string/template handling
      if (inSQ) {
        if (!escape && ch === '\\') {
          escape = true
          continue
        }

        if (!escape && ch === '\'') {
          inSQ = false
        }

        escape = false
        continue
      }
      if (inDQ) {
        if (!escape && ch === '\\') {
          escape = true
          continue
        }

        if (!escape && ch === '"') {
          inDQ = false
        }

        escape = false
        continue
      }
      if (inTQ) {
        if (!escape && ch === '\\') {
          escape = true
          continue
        }

        if (!escape && ch === '`') {
          inTQ = false
        }

        escape = false
        continue
      }

      // comment starts
      if (ch === '/' && next === '*') {
        inBlock = true
        i++
        col++
        continue
      }
      if (ch === '/' && next === '/') {
        inLine = true
        i++
        col++
        continue
      }

      // string starts
      if (ch === '\'') {
        inSQ = true
        continue
      }
      if (ch === '"') {
        inDQ = true
        continue
      }
      if (ch === '`') {
        inTQ = true
        continue
      }

      // brace depth (ignore in strings/comments handled above)
      if (ch === '{') {
        depth++
        continue
      }
      if (ch === '}') {
        if (depth > 0)
          depth--
        continue
      }

      // detect 'await' token
      if (ch === 'a' && text.slice(i, i + 5) === 'await') {
        const before = text.slice(Math.max(0, i - 6), i) // enough to catch 'for '
        const isForAwait = /for\s+$/.test(before)
        const isWordBoundaryBefore = i === 0 || /[^$\w]/.test(text[i - 1])
        const isWordBoundaryAfter = /[^$\w]/.test(text[i + 5] || ' ')
        if (!isForAwait && isWordBoundaryBefore && isWordBoundaryAfter && depth === 0) {
          pushIssue(col)
        }
        i += 4
        col += 4
        continue
      }
    }

    return issues
  },
}
