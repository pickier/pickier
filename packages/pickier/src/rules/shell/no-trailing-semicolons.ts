import type { RuleModule } from '../../types'

/**
 * Disallow unnecessary trailing semicolons on simple commands.
 * In shell, semicolons separate commands on the same line but are unnecessary at end of line.
 */
export const noTrailingSemicolonsRule: RuleModule = {
  meta: {
    docs: 'Disallow unnecessary trailing semicolons',
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

      const trimmed = line.replace(/^\s+/, '').trimEnd()
      if (trimmed.startsWith('#'))
        continue

      // Skip case terminators (;; is valid and necessary)
      if (/;;\s*$/.test(trimmed))
        continue
      // Skip lines where ; is part of for-loop or while-loop syntax
      if (/\bfor\b/.test(trimmed) || /\bwhile\b/.test(trimmed) || /\buntil\b/.test(trimmed))
        continue
      // Skip `; then`, `; do`, `; else` patterns (control flow separators)
      if (/;\s*(?:then|do|else|elif|fi|done|esac)\s*$/.test(trimmed))
        continue

      // Check for trailing semicolons
      if (/;\s*$/.test(trimmed)) {
        const col = line.lastIndexOf(';')
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col + 1,
          ruleId: 'shell/no-trailing-semicolons',
          message: 'Unnecessary trailing semicolon',
          severity: 'warning',
        })
      }
    }
    return issues
  },
  fix(content) {
    const lines = content.split(/\r?\n/)
    const result: string[] = []
    let inHeredoc = false
    let heredocDelim = ''

    for (const line of lines) {
      if (inHeredoc) {
        result.push(line)
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?/)
      if (heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch[1]
      }

      const trimmed = line.replace(/^\s+/, '').trimEnd()
      if (trimmed.startsWith('#') || /;;\s*$/.test(trimmed)
        || /\bfor\b/.test(trimmed) || /\bwhile\b/.test(trimmed) || /\buntil\b/.test(trimmed)
        || /;\s*(?:then|do|else|elif|fi|done|esac)\s*$/.test(trimmed)) {
        result.push(line)
        continue
      }

      // Remove trailing semicolons
      result.push(line.replace(/;\s*$/, ''))
    }
    return result.join('\n')
  },
}
