import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Word operators that need space after them
const WORD_OPS = ['typeof', 'void', 'delete', 'new', 'throw', 'yield', 'await']
// Symbol operators that should NOT have space
const _SYMBOL_OPS = ['!', '~', '++', '--']

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const spaceUnaryOpsRule: RuleModule = {
  meta: {
    docs: 'Require space after word unary operators, disallow space after symbol unary operators',
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

      // Check word operators need space after
      for (const op of WORD_OPS) {
        const re = new RegExp(`\\b${op}([^\\s;,)])`, 'g')
        let match
        while ((match = re.exec(line)) !== null) {
          if (isInStringOrComment(line, match.index))
            continue

          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: match.index + op.length + 1,
            ruleId: 'style/space-unary-ops',
            message: `Missing space after '${op}'`,
            severity: 'warning',
          })
        }
      }

      // Check ! should not have space after (prefix unary)
      // Match ! followed by space then identifier/paren (but not != and !==)
      const bangSpaceRe = /!\s+([a-zA-Z_$({[])/g
      let match
      while ((match = bangSpaceRe.exec(line)) !== null) {
        if (isInStringOrComment(line, match.index))
          continue

        // Make sure the ! is a unary operator (preceded by operator or start)
        const before = line.slice(0, match.index)
        const prevChar = before.trimEnd().slice(-1)
        const unaryPrecedeRe = new RegExp('[=(<[{,' + ';' + '|&?:+\\-*/!~^%]')
        if (!prevChar || unaryPrecedeRe.test(prevChar) || before.trimEnd().endsWith('return') || before.trimEnd().endsWith('case')) {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: match.index + 2,
            ruleId: 'style/space-unary-ops',
            message: 'Unexpected space after \'!\'',
            severity: 'warning',
          })
        }
      }

      // Check ~ should not have space after
      const tildeSpaceRe = /~\s+([a-zA-Z_$({[])/g
      while ((match = tildeSpaceRe.exec(line)) !== null) {
        if (isInStringOrComment(line, match.index))
          continue

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: match.index + 2,
          ruleId: 'style/space-unary-ops',
          message: 'Unexpected space after \'~\'',
          severity: 'warning',
        })
      }
    }

    return issues
  },
  fix(content: string): string {
    let result = content
    // Add space after word operators
    for (const op of WORD_OPS) {
      result = result.replace(new RegExp(`\\b${op}([^\\s;,)])`, 'g'), `${op} $1`)
    }
    // Remove space after ! (unary)
    result = result.replace(/!\s+([a-zA-Z_$({[])/g, '!$1')
    // Remove space after ~
    result = result.replace(/~\s+([a-zA-Z_$({[])/g, '~$1')
    return result
  },
}
