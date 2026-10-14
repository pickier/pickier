import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { maskNonCode } from '../../lexer'

/**
 * Prefer template literals over string concatenation
 *
 * Flags cases like: 'hello ' + name + '!'
 * Suggests: `hello ${name}!`
 *
 * The patterns run over the masked source (lexer.ts), so only a `+` that is
 * code is a candidate. A file that generates code holds lines of another
 * program as strings, and a `+` in one of those - the first character of a
 * message the generated program prints, say - is text with no concatenation
 * to replace (#1380).
 */
export const preferTemplate: RuleModule = {
  meta: {
    docs: 'Prefer template literals over string concatenation',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = maskNonCode(content).split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Skip comments and imports
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('import'))
        continue

      // Look for string concatenation patterns
      // Pattern 1: 'string' + variable
      // Pattern 2: variable + 'string'
      // Pattern 3: 'string' + 'string'

      // Simple heuristic: look for + operator between strings or identifiers
      // This is a lightweight check that catches common cases
      // Pattern: string + identifier OR identifier + string
      const stringPlusIdentifier = /(['"`][^'"`]*['"`])\s*\+\s*([a-z_$][\w$]*)/i
      const identifierPlusString = /([a-z_$][\w$]*)\s*\+\s*(['"`][^'"`]*['"`])/i
      const match = trimmed.match(stringPlusIdentifier) || trimmed.match(identifierPlusString)

      if (match) {
        const matchIdx = line.indexOf(match[0])

        // Skip patterns like: identifier + 'string'.length (property access on string, not concatenation)
        // Only applies when the STRING is at the END of the match and followed by '.'
        const isIdentPlusString = !!trimmed.match(identifierPlusString)
        const isStringPlusIdent = !!trimmed.match(stringPlusIdentifier)
        // If identifierPlusString matches and stringPlusIdentifier does NOT, the string is at end
        if (isIdentPlusString && !isStringPlusIdent) {
          const afterMatch = trimmed.slice(trimmed.indexOf(match[0]) + match[0].length)
          if (afterMatch.startsWith('.'))
            continue
        }

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: matchIdx + 1,
          ruleId: 'general/prefer-template',
          message: 'Unexpected string concatenation. Use template literals instead',
          severity: 'warning',
          // eslint-disable-next-line no-template-curly-in-string -- the example in this help text is the rule's own subject
          help: 'Use template literals (backticks) instead of string concatenation. Example: `hello ${name}!` instead of \'hello \' + name + \'!\'',
        })
      }
    }

    return issues
  },
}
