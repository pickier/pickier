import type { RuleModule } from '../../types'

/**
 * SC2002: Useless use of cat. Instead of `cat file | cmd`, use `cmd < file` or `cmd file`.
 * Avoids spawning an unnecessary process.
 */
export const noUselessCatRule: RuleModule = {
  meta: {
    docs: 'Detect useless use of cat (UUOC)',
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

      // Pattern: cat <single-file> | command
      // Matches: cat file | ..., cat "file" | ..., cat 'file' | ...
      // Does NOT match: cat file1 file2 | ... (multiple files is legitimate)
      const catPipeMatch = line.match(/\bcat\s+(["']?[\w.\/~${}*?-]+["']?)\s*\|/)
      if (catPipeMatch) {
        const col = line.indexOf('cat')
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col + 1,
          ruleId: 'shell/no-useless-cat',
          message: `Useless use of cat — pipe the file directly instead of \`cat ${catPipeMatch[1]} | ...\``,
          severity: 'warning',
          help: `Use \`cmd < ${catPipeMatch[1]}\` or pass the file as an argument to the command`,
        })
      }
    }
    return issues
  },
}
