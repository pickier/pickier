import type { RuleModule } from '../../types'

export const preferObjectSpreadRule: RuleModule = {
  meta: {
    docs: 'Prefer object spread ({...obj}) over Object.assign() for object composition',
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comment-only lines
      if (/^\s*\/\//.test(line))
        continue

      // Strip inline comments
      const commentIdx = line.indexOf('//')
      const codeOnly = commentIdx >= 0 ? line.slice(0, commentIdx) : line

      // Match Object.assign() calls
      // Look for: Object.assign({}, ...) or Object.assign(target, ...)
      const assignMatches = codeOnly.matchAll(/\bObject\.assign\s*\(/g)

      for (const match of assignMatches) {
        const startIdx = match.index!
        const beforeAssign = codeOnly.slice(0, startIdx)

        // Skip if inside a string (basic check)
        const singleQuotes = (beforeAssign.match(/'/g) || []).length
        const doubleQuotes = (beforeAssign.match(/"/g) || []).length
        const backticks = (beforeAssign.match(/`/g) || []).length

        if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0) {
          continue
        }

        // Find the opening parenthesis
        const openParenIdx = startIdx + 'Object.assign'.length
        const restOfLine = codeOnly.slice(openParenIdx)

        // Try to parse the first argument
        let firstArgEnd = -1
        let parenDepth = 1
        let braceDepth = 0
        let bracketDepth = 0
        let inString: 'single' | 'double' | 'template' | null = null
        let escaped = false

        for (let k = 1; k < restOfLine.length; k++) {
          const ch = restOfLine[k]

          if (escaped) {
            escaped = false
            continue
          }

          if (ch === '\\' && inString) {
            escaped = true
            continue
          }

          if (!inString) {
            if (ch === '\'') {
              inString = 'single'
            }
            else if (ch === '"') {
              inString = 'double'
            }
            else if (ch === '`') {
              inString = 'template'
            }
            else if (ch === '(') {
              parenDepth++
            }
            else if (ch === ')') {
              parenDepth--
              if (parenDepth === 0) {
                // End of Object.assign call
                break
              }
            }
            else if (ch === '{') {
              braceDepth++
            }
            else if (ch === '}') {
              braceDepth--
            }
            else if (ch === '[') {
              bracketDepth++
            }
            else if (ch === ']') {
              bracketDepth--
            }
            else if (ch === ',' && parenDepth === 1 && braceDepth === 0 && bracketDepth === 0) {
              firstArgEnd = k
              break
            }
          }
          else {
            if ((inString === 'single' && ch === '\'')
              || (inString === 'double' && ch === '"')
              || (inString === 'template' && ch === '`')) {
              inString = null
            }
          }
        }

        if (firstArgEnd === -1) {
          // Only one argument or couldn't parse - skip
          continue
        }

        const firstArg = restOfLine.slice(1, firstArgEnd).trim()

        // Check if first argument is an empty object literal {}
        // This is the most common case for preferring spread
        if (firstArg === '{}') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: startIdx + 1,
            ruleId: 'prefer-object-spread',
            message: 'Prefer object spread over Object.assign',
            severity: 'error',
            help: 'Use object spread syntax: {...obj} instead of Object.assign({}, obj)',
          })
        }
        // Also flag cases where the first argument is not being mutated in a clear way
        // (i.e., it's not a variable by itself, suggesting it's being used for merging)
        else if (firstArg === '{}' || /^\{.*\}$/.test(firstArg)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: startIdx + 1,
            ruleId: 'prefer-object-spread',
            message: 'Prefer object spread over Object.assign for object literals',
            severity: 'error',
            help: 'Use object spread syntax: {...obj1, ...obj2}',
          })
        }
      }
    }

    return issues
  },
  fix: (text) => {
    const lines = text.split(/\r?\n/)
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]

      // Simple fix for common case: Object.assign({}, ...)
      // This is a basic fixer - complex cases may need manual intervention
      line = line.replace(
        /\bObject\.assign\s*\(\s*\{\}\s*,\s*([^)]+)\)/g,
        (_match, args) => {
          // Split args by comma (simple heuristic)
          const argList = args.split(',').map((a: string) => a.trim())
          return `{${argList.map((arg: string) => `...${arg}`).join(', ')}}`
        },
      )

      result.push(line)
    }

    return result.join('\n')
  },
}
