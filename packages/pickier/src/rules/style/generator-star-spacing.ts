import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match function* patterns (declarations and expressions)
const FUNCTION_STAR_RE = /\bfunction\s*\*/g
// Match *methodName( patterns in class/object context (line starts with optional async then *)
const _METHOD_STAR_RE = /^(\s*(?:async\s+)?)\*\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const generatorStarSpacingRule: RuleModule = {
  meta: {
    docs: 'Enforce spacing around * in generator functions (space after, no space before)',
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

      // Check function* declarations/expressions
      let match
      FUNCTION_STAR_RE.lastIndex = 0

      while ((match = FUNCTION_STAR_RE.exec(line)) !== null) {
        const idx = match.index

        if (isInStringOrComment(line, idx))
          continue

        const fullMatch = match[0] // e.g. 'function*', 'function *', 'function  *'
        const starIdx = idx + fullMatch.indexOf('*')
        const afterStarIdx = starIdx + 1

        // Check for space before * (between 'function' and '*')
        // Correct: 'function*', Wrong: 'function *' or 'function  *'
        if (fullMatch !== 'function*') {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: starIdx + 1,
            ruleId: 'style/generator-star-spacing',
            message: 'Unexpected space before * in generator function',
            severity: 'warning',
          })
        }

        // Check for space after * (before function name or paren)
        // Correct: 'function* ' (space after), Wrong: 'function*name' (no space after)
        if (afterStarIdx < line.length && line[afterStarIdx] !== ' ' && line[afterStarIdx] !== '\t' && line[afterStarIdx] !== '\n' && line[afterStarIdx] !== '(') {
          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: afterStarIdx + 1,
            ruleId: 'style/generator-star-spacing',
            message: 'Missing space after * in generator function',
            severity: 'warning',
          })
        }
      }

      // Check *method() patterns in class/object bodies
      // Only check lines that start with optional whitespace + optional async + *
      const methodMatch = trimmed.match(/^(?:async\s+)?\*\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/)
      if (methodMatch) {
        const starPos = line.indexOf('*', line.indexOf(trimmed.charAt(0)))

        if (!isInStringOrComment(line, starPos)) {
          const afterStar = starPos + 1

          // Check for missing space after * in method shorthand
          if (afterStar < line.length && line[afterStar] !== ' ' && line[afterStar] !== '\t') {
            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: afterStar + 1,
              ruleId: 'style/generator-star-spacing',
              message: 'Missing space after * in generator method',
              severity: 'warning',
            })
          }
        }
      }
    }

    return issues
  },
  fix(content: string, _context: RuleContext): string {
    let result = content

    // Fix function declarations/expressions: normalize to 'function* '
    // Handle 'function *', 'function  *', etc. -> 'function*'
    result = result.replace(/\bfunction\s+\*/g, 'function*')

    // Ensure space after * in function* (before name or paren for anonymous)
    // function*foo -> function* foo
    result = result.replace(/\bfunction\*([a-zA-Z_$])/g, 'function* $1')

    // Fix *method() shorthand in classes/objects: ensure space after *
    // *foo( -> * foo( ... actually convention is `* foo(` with space after
    result = result.replace(/(^\s*(?:async\s+)?)\*([a-zA-Z_$])/gm, '$1* $2')

    return result
  },
}
