import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match patterns where { is not preceded by space but should be
// e.g., if(x){, function(){, else{
const NO_SPACE_BEFORE_BRACE_RE = /(\S)\{/g

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const spaceBeforeBlocksRule: RuleModule = {
  meta: {
    docs: 'Require space before opening brace of blocks',
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
      NO_SPACE_BEFORE_BRACE_RE.lastIndex = 0

      while ((match = NO_SPACE_BEFORE_BRACE_RE.exec(line)) !== null) {
        const idx = match.index
        const charBefore = match[1]

        if (isInStringOrComment(line, idx))
          continue

        // Skip template literals ${
        if (charBefore === '$')
          continue

        // Skip object literals and type annotations: = {, : {, ( {, , {, [ {
        if (charBefore === '=' || charBefore === ':' || charBefore === '(' || charBefore === ',' || charBefore === '[')
          continue

        // Skip nested braces {{
        if (charBefore === '{')
          continue

        // This is a block opening brace needing space: ){, keyword{
        if (charBefore === ')' || /[a-zA-Z0-9_]/.test(charBefore)) {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: match.index + 2,
            ruleId: 'style/space-before-blocks',
            message: 'Missing space before \'{\'',
            severity: 'warning',
          })
        }
      }
    }

    return issues
  },
  fix(content: string): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      // Add space before { when preceded by ) or word character
      // But not after $, =, :, (, ,, [, {
      const fixed = line.replace(/([)a-zA-Z0-9_])\{/g, '$1 {')
      result.push(fixed)
    }

    return result.join('\n')
  },
}
