import type { RuleModule } from '../../types'

/**
 * SC2006: Use $(...) notation instead of legacy backtick `...` command substitution.
 * Backticks are harder to nest and read. $() is the modern POSIX-compliant alternative.
 */
export const commandSubstitutionRule: RuleModule = {
  meta: {
    docs: 'Use $() instead of backticks for command substitution',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''
    let inSingleQuote = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track heredoc boundaries
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

      // Skip comment lines
      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Scan character by character for backticks outside single quotes and comments
      inSingleQuote = false
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]

        if (ch === '#' && !inSingleQuote)
          break // rest is comment
        if (ch === '\\') {
          j++
          continue
        }
        if (ch === '\'') {
          inSingleQuote = !inSingleQuote
          continue
        }
        if (inSingleQuote)
          continue

        if (ch === '`') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: j + 1,
            ruleId: 'shell/command-substitution',
            message: 'Use $(...) instead of backticks for command substitution',
            severity: 'error',
            help: 'Replace `cmd` with $(cmd) for better readability and nesting support',
          })
          // Skip to closing backtick
          for (j++; j < line.length && line[j] !== '`'; j++) {
            if (line[j] === '\\') j++
          }
        }
      }
    }
    return issues
  },
  fix(content, ctx) {
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

      // Replace backtick command substitutions outside single quotes and comments
      let out = ''
      let inSQ = false
      let i = 0
      while (i < line.length) {
        const ch = line[i]
        if (ch === '#' && !inSQ) {
          out += line.slice(i)
          break
        }
        if (ch === '\\') {
          out += line.slice(i, i + 2)
          i += 2
          continue
        }
        if (ch === '\'') {
          inSQ = !inSQ
          out += ch
          i++
          continue
        }
        if (inSQ) {
          out += ch
          i++
          continue
        }

        if (ch === '`') {
          // Extract backtick content
          let inner = ''
          i++
          while (i < line.length && line[i] !== '`') {
            if (line[i] === '\\') {
              inner += line[i + 1] || ''
              i += 2
            }
            else {
              inner += line[i]
              i++
            }
          }
          i++ // skip closing backtick
          out += `$(${inner})`
        }
        else {
          out += ch
          i++
        }
      }
      result.push(out)
    }
    return result.join('\n')
  },
}
