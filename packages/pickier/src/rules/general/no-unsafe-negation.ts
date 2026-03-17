import type { RuleModule } from '../../types'

export const noUnsafeNegationRule: RuleModule = {
  meta: {
    docs: 'Disallow negation of the left operand of relational operators',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match patterns like: !x in obj, !x instanceof Foo
      const inPattern = /!\s*\w+\s+in\s+/g
      const instanceofPattern = /!\s*\w+\s+instanceof\s+/g

      let match
      for (match = inPattern.exec(line); match !== null; match = inPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-unsafe-negation',
          message: 'Unexpected negation of \'in\' operand',
          severity: 'error',
        })
      }

      for (match = instanceofPattern.exec(line); match !== null; match = instanceofPattern.exec(line)) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'eslint/no-unsafe-negation',
          message: 'Unexpected negation of \'instanceof\' operand',
          severity: 'error',
        })
      }
    }

    return issues
  },
  fix: (text) => {
    let fixed = text

    // Fix: !x in obj => !(x in obj)
    fixed = fixed.replace(/!\s*(\w+)\s+in\s+/g, '!($1 in ')

    // Fix: !x instanceof Foo => !(x instanceof Foo)
    fixed = fixed.replace(/!\s*(\w+)\s+instanceof\s+/g, '!($1 instanceof ')

    return fixed
  },
}
