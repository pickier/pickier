import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match => without proper spacing
const _ARROW_NO_SPACE_BEFORE = /\S=>/g
const _ARROW_NO_SPACE_AFTER = /=>\S/g
const ARROW_RE = /=>/g

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const arrowSpacingRule: RuleModule = {
  meta: {
    docs: 'Require space before and after => in arrow functions',
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
      ARROW_RE.lastIndex = 0

      while ((match = ARROW_RE.exec(line)) !== null) {
        const idx = match.index

        if (isInStringOrComment(line, idx))
          continue

        // Check space before =>
        if (idx > 0 && line[idx - 1] !== ' ' && line[idx - 1] !== '\t') {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: idx + 1,
            ruleId: 'style/arrow-spacing',
            message: 'Missing space before =>',
            severity: 'warning',
          })
        }

        // Check space after =>
        const afterIdx = idx + 2
        if (afterIdx < line.length && line[afterIdx] !== ' ' && line[afterIdx] !== '\t' && line[afterIdx] !== '\n') {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: afterIdx + 1,
            ruleId: 'style/arrow-spacing',
            message: 'Missing space after =>',
            severity: 'warning',
          })
        }
      }
    }

    return issues
  },
  fix(content: string): string {
    // Add space before => if missing
    let result = content.replace(/(\S)=>/g, '$1 =>')
    // Add space after => if missing (but not at end of line)
    result = result.replace(/=>(\S)/g, '=> $1')
    return result
  },
}
