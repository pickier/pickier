import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match return (expr) where parens are not needed
const _RETURN_PARENS_RE = new RegExp('\\breturn\\s+\\(([^()]*)\\)\\s*[' + ';' + '\\n]', 'g')
// Match simple expressions that don't need parens: identifiers, literals, member access
const SIMPLE_EXPR_RE = /^[a-zA-Z_$][a-zA-Z0-9_$.[\]'"`]*$/

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const noExtraParensRule: RuleModule = {
  meta: {
    docs: 'Remove redundant parentheses in return statements',
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

      // Check return (simpleExpr)
      const returnRe = new RegExp('^return\\s+\\(([^()]*)\\)\\s*' + ';' + '?\\s*$')
      const returnMatch = trimmed.match(returnRe)
      if (returnMatch) {
        const inner = returnMatch[1].trim()
        // Only flag if the inner expression is simple (no operators that would change precedence)
        if (SIMPLE_EXPR_RE.test(inner) || /^['"`]/.test(inner) || /^\d/.test(inner) || inner === 'true' || inner === 'false' || inner === 'null' || inner === 'undefined') {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: line.indexOf('(') + 1,
            ruleId: 'style/no-extra-parens',
            message: 'Unnecessary parentheses around return value',
            severity: 'warning',
            help: 'Remove the outer parentheses.',
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
      const trimmed = line.trim()
      const fixReturnRe = new RegExp('^return\\s+\\(([^()]*)\\)\\s*(' + ';' + '?)\\s*$')
      const returnMatch = trimmed.match(fixReturnRe)

      if (returnMatch) {
        const inner = returnMatch[1].trim()
        const semi = returnMatch[2]
        if (SIMPLE_EXPR_RE.test(inner) || /^['"`]/.test(inner) || /^\d/.test(inner) || inner === 'true' || inner === 'false' || inner === 'null' || inner === 'undefined') {
          const indent = line.match(/^(\s*)/)?.[1] || ''
          result.push(`${indent}return ${inner}${semi}`)
          continue
        }
      }

      result.push(line)
    }

    return result.join('\n')
  },
}
