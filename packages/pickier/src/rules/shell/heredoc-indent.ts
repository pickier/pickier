import type { RuleModule } from '../../types'

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

      // Match << (not <<-) heredoc that is indented (inside a block)
      const heredocMatch = line.match(/^(\s+).*<<\s*(['"]?)(\w+)\2\s*$/)
      if (heredocMatch && !line.includes('<<-')) {
        const indent = heredocMatch[1]
        const delim = heredocMatch[3]

        // Only flag if the heredoc is indented (inside a block)
        if (indent.length > 0) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: line.indexOf('<<') + 1,
            ruleId: 'shell/heredoc-indent',
            message: `Use <<- instead of << for indented heredoc (delimiter '${delim}' must be at column 0 otherwise)`,
            severity: 'warning',
            help: 'Use <<- to strip leading tabs from heredoc content, allowing proper indentation',
          })
        }
      }
    }
    return issues
  },
}
