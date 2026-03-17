import type { RuleModule } from '../../types'

export const noSelfAssignRule: RuleModule = {
  meta: {
    docs: 'Disallow assignments where both sides are identical',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match simple assignments: identifier = identifier
      const simpleAssignRe = new RegExp('\\b(\\w+)\\s*=\\s*(\\w+)\\s*(?:' + ';' + '\\s*)?(?:\\/\\/.*)?$')
      const simpleMatch = line.match(simpleAssignRe)
      if (simpleMatch && simpleMatch[1] === simpleMatch[2]) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, line.indexOf(simpleMatch[1]) + 1),
          ruleId: 'eslint/no-self-assign',
          message: `'${simpleMatch[1]}' is assigned to itself`,
          severity: 'error',
        })
        continue
      }

      // Match property assignments: obj.prop = obj.prop
      const propMatch = line.match(/([\w.]+)\s*=\s*([\w.]+)/)
      if (propMatch && propMatch[1] === propMatch[2]) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: Math.max(1, line.indexOf(propMatch[1]) + 1),
          ruleId: 'eslint/no-self-assign',
          message: `'${propMatch[1]}' is assigned to itself`,
          severity: 'error',
        })
        continue
      }

      // Match array element assignments: arr[0] = arr[0]
      const arrayMatch = line.match(/(\w+\[[^\]]+\])\s*=\s*(\w+\[[^\]]+\])/)
      if (arrayMatch) {
        const left = arrayMatch[1].replace(/\s/g, '')
        const right = arrayMatch[2].replace(/\s/g, '')
        if (left === right) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, line.indexOf(arrayMatch[1]) + 1),
            ruleId: 'eslint/no-self-assign',
            message: `'${arrayMatch[1]}' is assigned to itself`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const issues = noSelfAssignRule.check!(text, ctx)
    if (issues.length === 0)
      return text

    const lines = text.split(/\r?\n/)
    const linesToRemove = new Set(issues.map(issue => issue.line - 1))

    // Remove or comment out self-assignments
    const fixed = lines.map((line, i) => {
      if (linesToRemove.has(i)) {
        // If the line is only whitespace + self-assignment, remove it
        const trimmed = line.trim()
        const selfAssignRe = new RegExp('^\\w+(?:\\.\\w+|\\[[^\\]]+\\])?\\s*=\\s*\\w+(?:\\.\\w+|\\[[^\\]]+\\])?' + ';' + '?\\s*$')
        if (selfAssignRe.test(trimmed)) {
          return '' // Remove the line entirely
        }
      }
      return line
    }).filter((line, i, arr) => {
      // Remove empty lines that were created by removing self-assignments
      if (line === '' && linesToRemove.has(i)) {
        // Check if surrounding lines would create too much whitespace
        const prevNonEmpty = i > 0 && arr[i - 1].trim() !== ''
        const nextNonEmpty = i < arr.length - 1 && arr[i + 1] && arr[i + 1].trim() !== ''
        if (!prevNonEmpty || !nextNonEmpty)
          return false
      }
      return true
    })

    return fixed.join('\n')
  },
}
