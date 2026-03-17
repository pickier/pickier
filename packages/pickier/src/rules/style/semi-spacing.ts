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

export const semiSpacingRule: RuleModule = {
  meta: {
    docs: 'Disallow space before semicolons, require space after',
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

      for (let j = 0; j < line.length; j++) {
        if (line[j] !== ';')
          continue

        if (isInStringOrComment(line, j))
          continue

        // Check space before semicolon
        if (j > 0 && line[j - 1] === ' ') {
          // Make sure it's not just whitespace before
          const beforeSemi = line.slice(0, j).trim()
          if (beforeSemi.length > 0) {
            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: j + 1,
              ruleId: 'style/semi-spacing',
              message: 'Unexpected space before semicolon',
              severity: 'warning',
            })
          }
        }

        // Check space after semicolon (in for loop headers)
        if (j + 1 < line.length && line[j + 1] !== ' ' && line[j + 1] !== '\t' && line[j + 1] !== '\n' && line[j + 1] !== '\r' && line[j + 1] !== ')') {
          // Only flag in for-loop style contexts (multiple ; on one line)
          const afterSemi = line.slice(j + 1)
          const beforeSemi = line.slice(0, j)
          if (beforeSemi.includes(';') || afterSemi.includes(';')) {
            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: j + 2,
              ruleId: 'style/semi-spacing',
              message: 'Missing space after semicolon',
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

    for (const line of lines) {
      let fixed = line
      // Remove space before semicolon
      const spaceSemiRe = new RegExp(' ' + ';', 'g')
      fixed = fixed.replace(spaceSemiRe, String.fromCharCode(59))
      // Add space after semicolon in for-loop headers
      const semiNonSpaceRe = new RegExp(';' + '(\\S)', 'g')
      fixed = fixed.replace(semiNonSpaceRe, (m, after) => {
        if (after === ';' || after === ')')
          return m
        return `; ${after}`
      })
      result.push(fixed)
    }

    return result.join('\n')
  },
}
