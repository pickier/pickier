import type { RuleModule } from '../../types'

export const preferNullishCoalescingRule: RuleModule = {
  meta: {
    docs: 'Prefer nullish coalescing operator (??) over logical OR (||) when checking for null/undefined',
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []

    // Only check TypeScript files
    if (!/\.tsx?$/.test(ctx.filePath)) {
      return issues
    }

    const lines = text.split(/\r?\n/)
    let inBlockComment = false

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      const originalLine = line

      // Handle block comments
      if (inBlockComment) {
        const endIdx = line.indexOf('*/')
        if (endIdx >= 0) {
          line = line.slice(endIdx + 2)
          inBlockComment = false
        }
        else {
          continue
        }
      }

      const blockStart = line.indexOf('/*')
      const lineComment = line.indexOf('//')

      if (blockStart >= 0 && (lineComment === -1 || blockStart < lineComment)) {
        const endIdx = line.indexOf('*/', blockStart + 2)
        if (endIdx >= 0) {
          line = line.slice(0, blockStart) + line.slice(endIdx + 2)
        }
        else {
          inBlockComment = true
          line = line.slice(0, blockStart)
        }
      }

      if (lineComment >= 0) {
        line = line.slice(0, lineComment)
      }

      // Remove strings to avoid false positives
      const cleanedLine = line.replace(/(['"`])(?:(?!\1)[^\\]|\\.)*?\1/g, '""')

      // Look for || operator
      const orPattern = /\|\|/g
      let match: RegExpExecArray | null

      // eslint-disable-next-line no-cond-assign
      while ((match = orPattern.exec(cleanedLine)) !== null) {
        const idx = match.index

        // Get the left side of the || operator
        // We need to identify if it's comparing against null/undefined
        let leftStart = idx - 1
        let parenDepth = 0
        let braceDepth = 0
        let bracketDepth = 0

        // Walk backwards to find the start of the left operand
        while (leftStart >= 0) {
          const ch = cleanedLine[leftStart]

          if (ch === ')') {
            parenDepth++
          }
          else if (ch === '(') {
            if (parenDepth === 0) {
              leftStart++
              break
            }
            parenDepth--
          }
          else if (ch === '}') {
            braceDepth++
          }
          else if (ch === '{') {
            if (braceDepth === 0) {
              leftStart++
              break
            }
            braceDepth--
          }
          else if (ch === ']') {
            bracketDepth++
          }
          else if (ch === '[') {
            if (bracketDepth === 0) {
              leftStart++
              break
            }
            bracketDepth--
          }
          else if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
            // Check for operators that would end the left operand
            if (/[;,=:?]/.test(ch)) {
              leftStart++
              break
            }
            // Check for other logical operators
            if (ch === '&' || ch === '|') {
              leftStart++
              break
            }
          }

          leftStart--
        }

        if (leftStart < 0)
          leftStart = 0

        const leftOperand = cleanedLine.slice(leftStart, idx).trim()

        // Heuristic: If the left operand is a simple variable/property access,
        // it's likely meant to check for null/undefined
        // Patterns that suggest nullish check:
        // - variable names
        // - property access (obj.prop, obj?.prop)
        // - function calls that might return null/undefined
        // - NOT boolean expressions or comparisons

        // Skip if left operand contains boolean operators or comparisons
        if (/[<>!=]/.test(leftOperand)) {
          continue
        }

        // Skip if it's a boolean literal
        if (/\b(true|false)\b/.test(leftOperand)) {
          continue
        }

        // Check if the right side is a default value (not a boolean)
        const rightStart = idx + 2
        let rightEnd = rightStart
        parenDepth = 0
        braceDepth = 0
        bracketDepth = 0

        while (rightEnd < cleanedLine.length) {
          const ch = cleanedLine[rightEnd]

          if (ch === '(') {
            parenDepth++
          }
          else if (ch === ')') {
            if (parenDepth === 0)
              break
            parenDepth--
          }
          else if (ch === '{') {
            braceDepth++
          }
          else if (ch === '}') {
            if (braceDepth === 0)
              break
            braceDepth--
          }
          else if (ch === '[') {
            bracketDepth++
          }
          else if (ch === ']') {
            if (bracketDepth === 0)
              break
            bracketDepth--
          }
          else if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
            if (/[;,?:]/.test(ch))
              break
            // Stop at other operators
            if (ch === '&' || (ch === '|' && cleanedLine[rightEnd + 1] === '|'))
              break
          }

          rightEnd++
        }

        const rightOperand = cleanedLine.slice(rightStart, rightEnd).trim()

        // If both operands look like values (not booleans), suggest ??
        // This is a heuristic - we suggest ?? when it looks like a default value pattern
        const looksLikeDefaultValue = (
          // Right operand is a number, string, object, or function call
          /^["'`\d]/.test(rightOperand)
          || /^\{/.test(rightOperand)
          || /^[\w$]+\(/.test(rightOperand)
          || /^[\w$.[\]]+$/.test(rightOperand)
        )

        const looksLikeNullableValue = (
          // Left operand is a variable, property access, or function call
          /^[\w$]+$/.test(leftOperand)
          || /^[\w$.?[\]()]+$/.test(leftOperand)
        )

        if (looksLikeDefaultValue && looksLikeNullableValue) {
          const actualIdx = originalLine.indexOf('||', Math.max(0, idx - 5))
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: actualIdx >= 0 ? actualIdx + 1 : idx + 1,
            ruleId: 'ts/prefer-nullish-coalescing',
            message: 'Prefer nullish coalescing operator (??) over logical OR (||)',
            severity: 'error',
            help: 'Use `??` instead of `||` to only handle null/undefined, not falsy values like 0, "", or false',
          })
        }
      }
    }

    return issues
  },
  fix: (text) => {
    // Conservative auto-fix: only replace in obvious cases
    const lines = text.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      // Simple pattern: variable || defaultValue
      // Replace with variable ?? defaultValue
      // Only for simple cases to avoid breaking boolean logic
      let fixedLine = line

      // Pattern: identifier || value (where value doesn't look like boolean)
      fixedLine = fixedLine.replace(
        /(\b[\w$]+(?:\.[\w$]+)*)\s*\|\|\s*([^|&]+?)(?=\s*[;,)\]}]|$)/g,
        (match, left, right) => {
          // Don't replace if right side looks like boolean
          if (/\b(?:true|false)\b/.test(right.trim())) {
            return match
          }
          return `${left} ?? ${right}`
        },
      )

      result.push(fixedLine)
    }

    return result.join('\n')
  },
}
