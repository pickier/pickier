import type { RuleModule } from '../../types'
import { maskShellStrings } from './_shared'

/**
 * Recommend <<- (with tab stripping) for indented heredocs.
 * When a heredoc is inside a function or loop, using << requires the delimiter
 * to be at column 0, which breaks indentation flow.
 */
export const heredocIndentRule: RuleModule = {
  meta: {
    docs: 'Recommend <<- for heredocs inside indented blocks',
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Only indented lines can need <<- in the first place
      const indent = line.match(/^\s+/)
      if (!indent)
        continue

      // Locate a real << operator on the masked line so that `<<` quoted in
      // a string never counts, and exclude <<- (already fine) and <<< (a
      // here-string, not a heredoc). Masking preserves indices.
      const masked = maskShellStrings(line)
      const op = masked.match(/(?<!<)<<(?![<-])/)
      if (!op || op.index === undefined)
        continue

      // The delimiter (read from the original line — masking blanks quoted
      // delimiters) must end the line, matching the old rule's scope.
      const after = line.slice(op.index + 2)
      const delimMatch = after.match(/^\s*(['"]?)(\w+)\1\s*$/)
      if (delimMatch) {
        const delim = delimMatch[2]
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: op.index + 1,
          ruleId: 'shell/heredoc-indent',
          message: `Use <<- instead of << for indented heredoc (delimiter '${delim}' must be at column 0 otherwise)`,
          severity: 'warning',
          help: 'Use <<- to strip leading tabs from heredoc content, allowing proper indentation',
        })
      }
    }
    return issues
  },
}
