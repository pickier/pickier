import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Keywords that can be followed by space+( and should NOT be flagged
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return',
  'typeof', 'void', 'delete', 'throw', 'new', 'await', 'class',
  'import', 'export', 'from', 'of', 'in', 'case', 'default',
  'yield', 'else', 'do', 'try', 'finally', 'with', 'async',
  'super', 'this', 'extends', 'implements', 'instanceof',
])

// Match identifier followed by whitespace then (
// Captures: the identifier and the space
const CALL_SPACE_RE = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s+\(/g

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const functionCallSpacingRule: RuleModule = {
  meta: {
    docs: 'Disallow spaces between function name and opening parenthesis in calls',
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
      CALL_SPACE_RE.lastIndex = 0

      while ((match = CALL_SPACE_RE.exec(line)) !== null) {
        const identifier = match[1]
        const idx = match.index

        if (isInStringOrComment(line, idx))
          continue

        // Skip keywords
        if (KEYWORDS.has(identifier))
          continue

        // Skip function declarations: 'function name ('
        // Check if 'function' keyword precedes the identifier
        const beforeIdent = line.slice(0, idx).trimEnd()
        if (beforeIdent.endsWith('function') || beforeIdent.endsWith('function*'))
          continue

        // Skip if preceded by 'async' keyword for 'async name (' pattern in declarations
        // e.g., 'async function foo (' - the 'foo' would match but 'function' check above handles it
        // But 'async foo(' as a method declaration could be tricky - skip class method declarations
        // Check if this looks like a method definition (preceded by async, get, set, static, etc.)
        if (/\b(?:get|set)\s*$/.test(beforeIdent))
          continue

        const spaceStart = idx + identifier.length

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: spaceStart + 1,
          ruleId: 'style/function-call-spacing',
          message: 'Unexpected space between function name and parenthesis',
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
      // Process replacements from right to left to preserve indices
      const matches: Array<{ index: number, fullMatch: string, identifier: string }> = []
      let match

      CALL_SPACE_RE.lastIndex = 0
      while ((match = CALL_SPACE_RE.exec(line)) !== null) {
        const identifier = match[1]
        const idx = match.index

        if (isInStringOrComment(line, idx))
          continue
        if (KEYWORDS.has(identifier))
          continue

        const beforeIdent = line.slice(0, idx).trimEnd()
        if (beforeIdent.endsWith('function') || beforeIdent.endsWith('function*'))
          continue
        if (/\b(?:get|set)\s*$/.test(beforeIdent))
          continue

        matches.push({ index: idx, fullMatch: match[0], identifier })
      }

      // Apply fixes from right to left
      for (let j = matches.length - 1; j >= 0; j--) {
        const m = matches[j]
        const start = m.index
        const end = start + m.fullMatch.length
        fixed = `${fixed.slice(0, start)}${m.identifier}(${fixed.slice(end)}`
      }

      result.push(fixed)
    }

    return result.join('\n')
  },
}
