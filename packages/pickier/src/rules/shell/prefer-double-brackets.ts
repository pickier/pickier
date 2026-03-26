import type { RuleModule } from '../../types'

/**
 * SC2292: Prefer [[ ]] over [ ] for tests in bash/zsh.
 * [[ ]] is safer: no word splitting, no pathname expansion, supports && || and regex.
 */
export const preferDoubleBracketsRule: RuleModule = {
  meta: {
    docs: 'Prefer [[ ]] over [ ] for test expressions in bash/zsh',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []

    // Only apply for bash/zsh scripts (not POSIX sh, not unknown)
    const firstLine = content.split(/\r?\n/)[0] || ''
    const isBashOrZsh = /bash|zsh/.test(firstLine)
    const isPosix = /^#!.*\bsh\b/.test(firstLine) && !isBashOrZsh
    // If no recognizable bash/zsh shebang, don't flag (could be POSIX)
    if (isPosix || !isBashOrZsh) return issues

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

      // Match standalone [ ] test (not [[ ]])
      // Pattern: [ followed by content and ] at end (possibly with ; then/do)
      const testMatch = line.match(/(?:^|\s|;)\[\s(?!\[)/)
      if (testMatch) {
        // Verify there's a matching ] (not ]])
        if (/(?<!\])\](?!\])/.test(line)) {
          const col = line.indexOf('[')
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: col + 1,
            ruleId: 'shell/prefer-double-brackets',
            message: 'Use [[ ]] instead of [ ] for test expressions in bash/zsh',
            severity: 'warning',
            help: '[[ ]] prevents word splitting and supports && || regex; [ ] is only needed for POSIX sh',
          })
        }
      }
    }
    return issues
  },
  fix(content) {
    // Only fix for bash/zsh (not POSIX sh, not unknown)
    const firstLine = content.split(/\r?\n/)[0] || ''
    const isBashOrZsh = /bash|zsh/.test(firstLine)
    if (!isBashOrZsh) return content

    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      let fixed = line
      // Replace `[ ... ]` with `[[ ... ]]` (simple cases only)
      // Careful not to affect [[ ]] or array subscripts
      fixed = fixed.replace(/(?:^|(?<=\s|;))\[(\s(?!\[).*?(?<!\]))\](?!\])/g, '[[$1]]')
      result.push(fixed)
    }
    return result.join('\n')
  },
}
