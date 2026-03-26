import type { RuleModule } from '../../types'

/**
 * SC2059/SC2086: Prefer printf over echo -e / echo -n.
 * echo behavior varies across shells and platforms; printf is portable and predictable.
 */
export const preferPrintfRule: RuleModule = {
  meta: {
    docs: 'Prefer printf over echo -e and echo -n',
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

      // Match echo -e or echo -n (with optional other flags like -en, -ne)
      const echoMatch = line.match(/\becho\s+-[en]+\b/)
      if (echoMatch) {
        const col = line.indexOf('echo')
        const flags = echoMatch[0].replace('echo ', '')
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col + 1,
          ruleId: 'shell/prefer-printf',
          message: `Use printf instead of echo ${flags} — echo behavior varies across platforms`,
          severity: 'warning',
          help: 'printf is portable: printf "format\\n" args... (use \\n for newline)',
        })
      }
    }
    return issues
  },
}
