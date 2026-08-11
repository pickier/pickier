import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match whitespace before . or ?. for property access on the same line
// Negative lookbehind for line start (handled separately) and for .. (spread)
const SPACE_BEFORE_DOT_RE = /(\S)\s+(\.)[a-zA-Z_$]/g
const SPACE_BEFORE_OPTIONAL_RE = /(\S)\s+(\?\.)[a-zA-Z_$]/g

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const noWhitespaceBeforePropertyRule: RuleModule = {
  meta: {
    docs: 'Disallow whitespace before . or ?. in property access',
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

      // Check for whitespace before .property (not ?.)
      let match
      SPACE_BEFORE_DOT_RE.lastIndex = 0

      while ((match = SPACE_BEFORE_DOT_RE.exec(line)) !== null) {
        const dotIdx = match.index + match[0].indexOf('.')

        if (isInStringOrComment(line, match.index))
          continue

        // Skip spread operator: if the char after the dot we found is also a dot, it's ..
        if (dotIdx + 1 < line.length && line[dotIdx + 1] === '.')
          continue

        // Skip if the dot is preceded by another dot (end of spread)
        if (dotIdx > 0 && line[dotIdx - 1] === '.')
          continue

        // The whitespace is between charBefore and the dot
        // Check that this whitespace is on the same line (not method chaining across lines)
        // Since we're checking within a single line, this is already the same line

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: dotIdx + 1,
          ruleId: 'style/no-whitespace-before-property',
          message: 'Unexpected whitespace before property access dot',
          severity: 'warning',
        })
      }

      // Check for whitespace before ?.property
      SPACE_BEFORE_OPTIONAL_RE.lastIndex = 0

      while ((match = SPACE_BEFORE_OPTIONAL_RE.exec(line)) !== null) {
        const optionalIdx = match.index + match[0].indexOf('?.')

        if (isInStringOrComment(line, match.index))
          continue

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: optionalIdx + 1,
          ruleId: 'style/no-whitespace-before-property',
          message: 'Unexpected whitespace before optional chaining operator',
          severity: 'warning',
        })
      }
    }

    return issues
  },
  fix(content: string, _context: RuleContext): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        result.push(line)
        continue
      }

      let fixed = line

      // Fix whitespace before ?. (do this first since it's longer and avoids partial matches)
      // Match: nonspace + whitespace + ?. + identifier char
      fixed = fixed.replace(/(\S)\s+(\?\.[a-zA-Z_$])/g, (fullMatch, before, dotAccess, offset) => {
        if (isInStringOrComment(line, offset))
          return fullMatch
        return before + dotAccess
      })

      // Fix whitespace before . (property access, not spread)
      // Match: nonspace + whitespace + . + identifier char (not followed by another dot)
      fixed = fixed.replace(/(\S)\s+(\.[a-zA-Z_$])/g, (fullMatch, before, dotAccess, offset) => {
        if (isInStringOrComment(line, offset))
          return fullMatch
        // Check it's not part of a spread operator
        const dotPos = offset + fullMatch.indexOf('.')
        if (dotPos + 1 < fixed.length && fixed[dotPos + 1] === '.')
          return fullMatch
        return before + dotAccess
      })

      result.push(fixed)
    }

    return result.join('\n')
  },
}
