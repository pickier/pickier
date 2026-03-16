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

export const blockSpacingRule: RuleModule = {
  meta: {
    docs: 'Require spaces inside single-line blocks',
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

      // Find single-line blocks: { ... } on the same line
      // Look for { followed immediately by non-space content and } on same line
      for (let j = 0; j < line.length; j++) {
        if (line[j] !== '{')
          continue
        if (isInStringOrComment(line, j))
          continue
        // Skip template literal ${}
        if (j > 0 && line[j - 1] === '$')
          continue

        // Find matching }
        let depth = 1
        let closeIdx = -1
        for (let k = j + 1; k < line.length; k++) {
          if (line[k] === '{' && !isInStringOrComment(line, k))
            depth++
          if (line[k] === '}' && !isInStringOrComment(line, k)) {
            depth--
            if (depth === 0) {
              closeIdx = k
              break
            }
          }
        }

        if (closeIdx === -1)
          continue // Multi-line block, skip

        // It's a single-line block
        const inner = line.slice(j + 1, closeIdx)
        if (!inner.trim())
          continue // Empty block

        // Check space after {
        if (inner[0] !== ' ' && inner[0] !== '\t') {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: j + 2,
            ruleId: 'style/block-spacing',
            message: 'Missing space after \'{\'',
            severity: 'warning',
          })
        }

        // Check space before }
        if (inner[inner.length - 1] !== ' ' && inner[inner.length - 1] !== '\t') {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: closeIdx + 1,
            ruleId: 'style/block-spacing',
            message: 'Missing space before \'}\'',
            severity: 'warning',
          })
        }

        break // Only check the first block on this line
      }
    }

    return issues
  },
  fix(content: string): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      // Fix single-line blocks: {content} -> { content }
      // But not empty braces {} and not template literals ${}
      let fixed = line.replace(/(?<!\$)\{(\S)([^}]*?)(\S)\}/g, (_m, first, middle, last) => {
        return `{ ${first}${middle}${last} }`
      })
      // Handle case where just the open or close needs space
      fixed = fixed.replace(/(?<!\$)\{(\S)([^}]*?)\s\}/g, (_m, first, rest) => {
        return `{ ${first}${rest} }`
      })
      fixed = fixed.replace(/(?<!\$)\{\s([^}]*?)(\S)\}/g, (_m, rest, last) => {
        return `{ ${rest}${last} }`
      })
      result.push(fixed)
    }

    return result.join('\n')
  },
}
