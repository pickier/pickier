import type { RuleModule } from '../../types'
import { maskNonCode } from '../../lexer'

// Heuristic: flag 'await' only when at top level (brace depth 0),
// outside of comments/strings/templates/regexes, and not part of 'for await'.
//
// The scan runs over the shared lexer's code-only view of the file. It used to
// track strings and comments itself, without regex literals: the `/*` inside
// `/\/?\*\*\/*\*\*$/` opened a block comment, and from there a backtick or an
// apostrophe in a real comment further down decided the brace depth - so an
// `await` inside a function was reported as top-level, or a real one missed.
export const noTopLevelAwaitRule: RuleModule = {
  meta: { docs: 'Disallow top-level await in TypeScript/JavaScript files' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const ext = ctx.filePath.split('.').pop() || ''
    if (!['ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs'].includes(ext))
      return issues

    const code = maskNonCode(text)
    let depth = 0
    let col = 0
    let lineNo = 1

    for (let i = 0; i < code.length; i++) {
      const ch = code[i]
      col++

      if (ch === '\n') {
        lineNo++
        col = 0
        continue
      }

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
      if (ch === 'a' && code.slice(i, i + 5) === 'await') {
        const before = code.slice(Math.max(0, i - 6), i) // enough to catch 'for '
        const isForAwait = /for\s+$/.test(before)
        const isWordBoundaryBefore = i === 0 || /[^$\w]/.test(code[i - 1])
        const isWordBoundaryAfter = /[^$\w]/.test(code[i + 5] || ' ')
        if (!isForAwait && isWordBoundaryBefore && isWordBoundaryAfter && depth === 0)
          issues.push({ filePath: ctx.filePath, line: lineNo, column: col, ruleId: 'ts/no-top-level-await', message: 'Do not use top-level await', severity: 'error' })
        i += 4
        col += 4
      }
    }

    return issues
  },
}
