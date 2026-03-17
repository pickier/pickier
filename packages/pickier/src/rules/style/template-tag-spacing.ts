import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match identifier followed by whitespace then backtick (tagged template with space)
const TAG_SPACE_RE = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s+`/g

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

// Keywords that can precede a template literal without being a tag function
const NON_TAG_KEYWORDS = new Set([
  'return', 'case', 'typeof', 'void', 'delete', 'throw', 'new',
  'in', 'of', 'await', 'yield', 'export', 'default', 'extends',
  'else', 'instanceof',
])

export const templateTagSpacingRule: RuleModule = {
  meta: {
    docs: 'Disallow space between tag function and template literal',
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

      let match
      TAG_SPACE_RE.lastIndex = 0

      for (match = TAG_SPACE_RE.exec(line); match !== null; match = TAG_SPACE_RE.exec(line)) {
        const identifier = match[1]
        const idx = match.index

        if (isInStringOrComment(line, idx))
          continue

        // Skip keywords that can precede template literals without being tags
        if (NON_TAG_KEYWORDS.has(identifier))
          continue

        const spaceStart = idx + identifier.length

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: spaceStart + 1,
          ruleId: 'style/template-tag-spacing',
          message: 'Unexpected space between tag function and template literal',
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
      const matches: Array<{ index: number, fullMatch: string, identifier: string }> = []
      let match

      TAG_SPACE_RE.lastIndex = 0
      for (match = TAG_SPACE_RE.exec(line); match !== null; match = TAG_SPACE_RE.exec(line)) {
        const identifier = match[1]
        const idx = match.index

        if (isInStringOrComment(line, idx))
          continue
        if (NON_TAG_KEYWORDS.has(identifier))
          continue

        matches.push({ index: idx, fullMatch: match[0], identifier })
      }

      // Apply fixes from right to left
      for (let j = matches.length - 1; j >= 0; j--) {
        const m = matches[j]
        const start = m.index
        const end = start + m.fullMatch.length
        fixed = fixed.slice(0, start) + m.identifier + '`' + fixed.slice(end)
      }

      result.push(fixed)
    }

    return result.join('\n')
  },
}
