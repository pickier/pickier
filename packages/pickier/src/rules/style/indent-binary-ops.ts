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

// Binary operators that may appear at the start of a continuation line
// Order matters: longer operators must come first to match correctly
const BINARY_OPS = [
  '===', '!==', '>>>',
  '==', '!=', '>=', '<=', '&&', '||', '??', '**', '<<', '>>',
  '+', '-', '*', '/', '%', '|', '&', '^', '>', '<',
  'instanceof', 'in',
]

// Pattern to detect if a trimmed line starts with a binary operator
const _LINE_STARTS_WITH_OP_RE = new RegExp(
  `^(${BINARY_OPS.map(op => op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s`,
)

// Word-boundary operators need special handling to avoid matching identifiers
const WORD_OPS = new Set(['in', 'instanceof'])
const WORD_OP_RE = /^(?:instanceof|in)\s/

function startsWithBinaryOp(trimmed: string): boolean {
  // Check word operators first (need word boundary)
  if (WORD_OP_RE.test(trimmed))
    return true

  // Check symbolic operators
  for (const op of BINARY_OPS) {
    if (WORD_OPS.has(op))
      continue
    if (trimmed.startsWith(op)) {
      // Make sure it's the operator, not part of a longer token
      const after = trimmed[op.length]
      // After the operator there should be whitespace or end of line
      if (after === undefined || after === ' ' || after === '\t')
        return true
    }
  }

  return false
}

function getOperatorLength(trimmed: string): number {
  for (const op of BINARY_OPS) {
    if (WORD_OPS.has(op)) {
      if (trimmed.startsWith(`${op} `) || trimmed.startsWith(`${op}\t`))
        return op.length
      continue
    }
    if (trimmed.startsWith(op)) {
      const after = trimmed[op.length]
      if (after === undefined || after === ' ' || after === '\t')
        return op.length
    }
  }
  return 0
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/)
  return match ? match[1].length : 0
}

export const indentBinaryOpsRule: RuleModule = {
  meta: {
    docs: 'Enforce consistent indentation of continuation lines in multiline binary expressions',
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

      // Only check lines that start with a binary operator
      if (!startsWithBinaryOp(trimmed))
        continue

      if (isInStringOrComment(line, 0))
        continue

      // Look backwards for the "start" line of this expression
      // (the nearest preceding line that does NOT start with a binary operator)
      let startLineIdx = i - 1
      while (startLineIdx >= 0) {
        const prevTrimmed = lines[startLineIdx].trim()
        if (!prevTrimmed || prevTrimmed.startsWith('//') || prevTrimmed.startsWith('*') || prevTrimmed.startsWith('/*')) {
          startLineIdx--
          continue
        }
        if (startsWithBinaryOp(prevTrimmed)) {
          startLineIdx--
          continue
        }
        break
      }

      if (startLineIdx < 0)
        continue

      const expectedIndent = getIndent(lines[startLineIdx]) + 2
      const actualIndent = getIndent(line)

      if (actualIndent !== expectedIndent) {
        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: actualIndent + 1,
          ruleId: 'style/indent-binary-ops',
          message: `Expected indentation of ${expectedIndent} spaces for binary operator continuation, but found ${actualIndent}`,
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

      if (!startsWithBinaryOp(trimmed) || isInStringOrComment(line, 0)) {
        result.push(line)
        continue
      }

      // Look backwards for the start line
      let startLineIdx = -1
      for (let j = result.length - 1; j >= 0; j--) {
        const prevTrimmed = result[j].trim()
        if (!prevTrimmed || prevTrimmed.startsWith('//') || prevTrimmed.startsWith('*') || prevTrimmed.startsWith('/*'))
          continue
        if (startsWithBinaryOp(prevTrimmed))
          continue
        startLineIdx = j
        break
      }

      if (startLineIdx < 0) {
        result.push(line)
        continue
      }

      const expectedIndent = getIndent(result[startLineIdx]) + 2
      const fixedLine = ' '.repeat(expectedIndent) + trimmed

      result.push(fixedLine)
      continue
    }

    return result.join('\n')
  },
}
