import type { LintIssue, RuleContext, RuleModule } from '../../types'

const MULTILINE_TRAILING_COMMA_RE = /,\s*$/
const CLOSING_BRACKET_RE = new RegExp('^\\s*[}\\])](?:\\s*' + ';' + '?\\s*)?$')

export const commaDangleRule: RuleModule = {
  meta: {
    docs: 'Require trailing commas in multiline constructs',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Check if this line is a closing bracket/brace/paren
      if (!CLOSING_BRACKET_RE.test(trimmed))
        continue

      const prevLine = lines[i - 1]
      const prevTrimmed = prevLine.trim()

      // Skip empty lines or lines that are just opening brackets
      if (!prevTrimmed || prevTrimmed === '{' || prevTrimmed === '[' || prevTrimmed === '(')
        continue

      // Skip comment lines
      if (prevTrimmed.startsWith('//') || prevTrimmed.startsWith('*') || prevTrimmed.startsWith('/*'))
        continue

      // Skip if previous line already has trailing comma
      if (MULTILINE_TRAILING_COMMA_RE.test(prevTrimmed))
        continue

      // Skip if previous line ends with opening bracket (nested structure)
      if (prevTrimmed.endsWith('{') || prevTrimmed.endsWith('[') || prevTrimmed.endsWith('('))
        continue

      // Skip if previous line ends with => (arrow function body follows)
      if (prevTrimmed.endsWith('=>'))
        continue

      // Skip if previous line is a spread element ending without comma (we still want the comma)
      // But skip if previous line ends with a closing bracket (handled by its own context)

      issues.push({
        filePath: context.filePath,
        line: i,
        column: prevLine.length + 1,
        ruleId: 'style/comma-dangle',
        message: 'Missing trailing comma',
        severity: 'warning',
        help: 'Add a trailing comma after the last element in multiline constructs.',
      })
    }

    return issues
  },
  fix(content: string): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim()
        const trimmed = line.trim()

        if (
          CLOSING_BRACKET_RE.test(nextTrimmed)
          && trimmed
          && trimmed !== '{'
          && trimmed !== '['
          && trimmed !== '('
          && !trimmed.startsWith('//')
          && !trimmed.startsWith('*')
          && !trimmed.startsWith('/*')
          && !MULTILINE_TRAILING_COMMA_RE.test(trimmed)
          && !trimmed.endsWith('{')
          && !trimmed.endsWith('[')
          && !trimmed.endsWith('(')
          && !trimmed.endsWith('=>')
        ) {
          result.push(line.replace(/(\s*)$/, ',$1'))
          continue
        }
      }

      result.push(line)
    }

    return result.join('\n')
  },
}
