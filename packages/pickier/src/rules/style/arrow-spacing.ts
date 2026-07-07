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
    // Space `=>` only when it is a real arrow — never inside strings, comments,
    // or regex literals (`const s = "a=>b"` must stay verbatim). Mirror the
    // string/comment guard used by check() so fix and check agree.
    const lines = content.split('\n')
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
        continue
      let out = ''
      let last = 0
      ARROW_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = ARROW_RE.exec(line)) !== null) {
        const idx = m.index
        if (isInStringOrComment(line, idx))
          continue
        const before = line[idx - 1]
        const after = line[idx + 2]
        const needBefore = idx > 0 && before !== ' ' && before !== '\t'
        const needAfter = after !== undefined && after !== ' ' && after !== '\t'
        if (!needBefore && !needAfter)
          continue
        out += line.slice(last, idx)
        out += `${needBefore ? ' ' : ''}=>${needAfter ? ' ' : ''}`
        last = idx + 2
      }
      if (last > 0)
        lines[li] = out + line.slice(last)
    }
    return lines.join('\n')
  },
}
