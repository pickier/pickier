import type { LintIssue, RuleContext, RuleModule } from '../../types'

const _OPERATORS = ['&&', '||', '??', '?', ':', '+', '-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>']
const LINE_END_OP_RE = /(\&\&|\|\||\?\?|\?|\+|(?<!=)-(?!=)|\*|\/|%|\*\*|\|(?!\|)|&(?!&)|\^|<<|>>>?)\s*$/

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const operatorLinebreakRule: RuleModule = {
  meta: {
    docs: 'Enforce operators at the beginning of continued lines',
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

      // Check if line ends with an operator (should be at start of next line)
      const match = trimmed.match(LINE_END_OP_RE)
      if (match && i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim()
        // Only flag if next line exists and is a continuation
        if (nextTrimmed && !nextTrimmed.startsWith('//') && !nextTrimmed.startsWith('*')) {
          const opIdx = line.lastIndexOf(match[1])
          if (!isInStringOrComment(line, opIdx)) {
            // Skip ternary operators ? : as they have complex contexts
            if (match[1] === '?' || match[1] === ':')
              continue

            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: opIdx + 1,
              ruleId: 'style/operator-linebreak',
              message: `Operator '${match[1]}' should be at the beginning of the next line`,
              severity: 'warning',
            })
          }
        }
      }
    }

    return issues
  },
  fix(content: string): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Skip comment lines
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.endsWith('*/')) {
        result.push(line)
        continue
      }

      const match = trimmed.match(LINE_END_OP_RE)

      if (match && i + 1 < lines.length && match[1] !== '?' && match[1] !== ':') {
        const nextLine = lines[i + 1]
        const nextTrimmed = nextLine.trim()
        if (nextTrimmed && !nextTrimmed.startsWith('//') && !nextTrimmed.startsWith('*')) {
          const op = match[1]
          const opIdx = line.lastIndexOf(match[1])
          // Skip if inside a string or comment
          if (isInStringOrComment(line, opIdx)) {
            result.push(line)
            continue
          }
          // Remove operator from end of current line
          result.push(line.replace(new RegExp(`\\s*${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), ''))
          // Prepend operator to next line
          const indent = nextLine.match(/^(\s*)/)?.[1] || ''
          lines[i + 1] = `${indent}${op} ${nextTrimmed}`
          continue
        }
      }

      result.push(line)
    }

    return result.join('\n')
  },
}
