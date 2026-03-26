import type { RuleModule } from '../../types'

/**
 * SC2069: Detect broken redirect ordering.
 * `cmd 2>&1 > file` redirects stderr to original stdout (terminal), not the file.
 * Correct: `cmd > file 2>&1` or `cmd &> file` (bash).
 */
export const noBrokenRedirectRule: RuleModule = {
  meta: {
    docs: 'Detect incorrect redirect ordering (2>&1 before > file)',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?/)
      if (heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch[1]
      }

      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Pattern: 2>&1 appears BEFORE > or >> redirect to file
      // This means stderr goes to terminal, not the file
      const brokenPattern = line.match(/2>&1\s+>(?!&)\s*\S/)
      if (brokenPattern) {
        const col = line.indexOf('2>&1')
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col + 1,
          ruleId: 'shell/no-broken-redirect',
          message: 'Broken redirect: 2>&1 before > file — stderr goes to terminal, not the file',
          severity: 'error',
          help: 'Swap the order: cmd > file 2>&1 (or use &> file in bash)',
        })
      }
    }
    return issues
  },
}
