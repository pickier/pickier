import type { LintIssue, RuleContext, RuleModule } from '../../types'

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

// Detect space after `<` in generic position: TypeName< T
const GENERIC_OPEN_SPACE_RE = /([A-Za-z_$][A-Za-z0-9_$]*)\s*<(\s+)/g
// Detect space before `>` in generic position (but not `=>`)
const GENERIC_CLOSE_SPACE_RE = /(\s+)>(?!=)/g

// Fix: remove spaces after `<` in generic contexts
const FIX_OPEN_RE = /([A-Za-z_$][A-Za-z0-9_$]*)\s*<\s+/g
// Fix: remove spaces before `>` (not `=>`)
const FIX_CLOSE_RE = /\s+>(?!=)/g

export const typeGenericSpacingRule: RuleModule = {
  meta: {
    docs: 'Disallow spaces inside TypeScript generic angle brackets',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
        continue

      // Check for space after `<` in generic positions
      GENERIC_OPEN_SPACE_RE.lastIndex = 0
      let match
      while ((match = GENERIC_OPEN_SPACE_RE.exec(line)) !== null) {
        const angleBracketIdx = match.index + match[1].length
        // Skip to the actual `<` position (account for optional spaces before <)
        const ltIdx = line.indexOf('<', angleBracketIdx)
        if (ltIdx === -1)
          continue
        if (isInStringOrComment(line, ltIdx))
          continue

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: ltIdx + 2,
          ruleId: 'ts/type-generic-spacing',
          message: 'Unexpected space after \'<\' in generic type',
          severity: 'warning',
        })
      }

      // Check for space before `>` (not `=>`)
      // We need to verify this `>` is likely a generic close, not a comparison
      // Heuristic: look for matching `<` earlier on the line from an identifier
      GENERIC_CLOSE_SPACE_RE.lastIndex = 0
      while ((match = GENERIC_CLOSE_SPACE_RE.exec(line)) !== null) {
        const gtIdx = match.index + match[1].length
        if (isInStringOrComment(line, gtIdx))
          continue

        // Heuristic: check if there's an opening `<` preceded by an identifier somewhere before
        const beforeGt = line.slice(0, gtIdx)
        const hasGenericOpen = /[A-Za-z_$][A-Za-z0-9_$]*\s*</.test(beforeGt)
        if (!hasGenericOpen)
          continue

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: gtIdx + 1,
          ruleId: 'ts/type-generic-spacing',
          message: 'Unexpected space before \'>\' in generic type',
          severity: 'warning',
        })
      }
    }

    return issues
  },
  fix(content: string, _context: RuleContext): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        result.push(line)
        continue
      }

      let fixed = line

      // Remove spaces after `<` in generic type positions: `Foo< T>` -> `Foo<T>`
      fixed = fixed.replace(FIX_OPEN_RE, (_match, ident) => {
        return `${ident}<`
      })

      // Remove spaces before `>` (not `=>`): `Foo<T >` -> `Foo<T>`
      // Only when there's a generic open `<` preceded by an identifier
      if (/[A-Za-z_$][A-Za-z0-9_$]*\s*</.test(fixed)) {
        fixed = fixed.replace(FIX_CLOSE_RE, '>')
      }

      result.push(fixed)
    }

    return result.join('\n')
  },
}
