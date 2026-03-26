import type { RuleModule } from '../../types'

/**
 * Enforce consistent placement of case statement terminators (;;).
 * Each case branch should end with ;; on its own line (or same line for one-liners).
 */
export const consistentCaseTerminatorsRule: RuleModule = {
  meta: {
    docs: 'Enforce consistent case statement terminator placement',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inCase = false
    let caseDepth = 0
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

      // Track case/esac nesting
      if (/\bcase\b.*\bin\s*$/.test(trimmed)) {
        inCase = true
        caseDepth++
        continue
      }
      if (/^esac\b/.test(trimmed)) {
        caseDepth--
        if (caseDepth <= 0) {
          inCase = false
          caseDepth = 0
        }
        continue
      }

      if (!inCase) continue

      // Check for ;; that's crammed on same line as a multi-statement command
      // One-liners like `pattern) cmd ;; ` are OK
      // But `cmd1; cmd2 ;;` is suspicious — we allow it since it's a style choice
      // Main check: ensure ;; exists and isn't missing
      // The pattern `)` indicates a case branch start — the branch must end with ;;
      if (/\)\s*$/.test(trimmed) && !trimmed.endsWith(';;')) {
        // This is a case pattern line — the next non-empty, non-comment lines
        // should eventually have ;;
        let foundTerminator = false
        for (let j = i + 1; j < lines.length && j < i + 50; j++) {
          const nextTrimmed = lines[j].replace(/^\s+/, '').trimEnd()
          if (nextTrimmed === '' || nextTrimmed.startsWith('#')) continue
          if (/;;\s*$/.test(nextTrimmed) || /^;;\s*$/.test(nextTrimmed)) {
            foundTerminator = true
            break
          }
          if (/^esac\b/.test(nextTrimmed)) break // esac without ;; on last branch is OK
          if (/\)\s*$/.test(nextTrimmed)) break // next pattern without ;;
        }
        if (!foundTerminator) {
          // Check if next pattern appears before any ;; — that's a missing terminator
          let nextPatternLine = -1
          for (let j = i + 1; j < lines.length && j < i + 50; j++) {
            const nextTrimmed = lines[j].replace(/^\s+/, '').trimEnd()
            if (nextTrimmed === '' || nextTrimmed.startsWith('#')) continue
            if (/^esac\b/.test(nextTrimmed)) break
            if (/\)\s*$/.test(nextTrimmed) && !/^esac/.test(nextTrimmed)) {
              nextPatternLine = j
              break
            }
          }
          if (nextPatternLine >= 0) {
            issues.push({
              filePath: ctx.filePath,
              line: nextPatternLine + 1,
              column: 1,
              ruleId: 'shell/consistent-case-terminators',
              message: 'Missing ;; terminator for previous case branch',
              severity: 'warning',
              help: 'Add ;; at the end of the case branch before the next pattern',
            })
          }
        }
      }
    }
    return issues
  },
}
