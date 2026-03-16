import type { RuleModule } from '../../types'

export const noFloatingPromisesRule: RuleModule = {
  meta: {
    docs: 'Require promises to be handled - must be awaited, returned, or have .catch() called',
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

      // Skip lines that are already handling promises
      // - await keyword
      // - return statement
      // - .then() or .catch() or .finally()
      // - void keyword (intentional fire-and-forget)
      if (/\b(?:await|return|void)\s/.test(cleanedLine)) {
        continue
      }

      if (/\.(?:then|catch|finally)\s*\(/.test(cleanedLine)) {
        continue
      }

      // Look for promise-returning patterns:
      // 1. Async function calls: asyncFunction()
      // 2. fetch() calls
      // 3. Promise constructor: new Promise()
      // 4. Promise static methods: Promise.resolve(), Promise.reject(), Promise.all(), etc.

      // Pattern 1: Function calls that might return promises
      // Heuristic: functions with 'async', 'fetch', 'load', 'get', 'post', 'put', 'delete', 'save', 'update' in name
      const promiseLikePatterns = [
        /\b(fetch|axios|request)\s*\(/,
        /\b[\w$]*(?:async|Async|load|Load|get|Get|post|Post|put|Put|delete|Delete|save|Save|update|Update|fetch|Fetch)[\w$]*\s*\(/,
        /\bnew\s+Promise\s*\(/,
        /\bPromise\s*\.\s*(?:resolve|reject|all|allSettled|race|any)\s*\(/,
      ]

      for (const pattern of promiseLikePatterns) {
        const match = cleanedLine.match(pattern)
        if (!match)
          continue

        // Check if this call is being handled
        const callIdx = cleanedLine.indexOf(match[0])

        // Check context before the call
        const before = cleanedLine.slice(0, callIdx).trim()

        // Skip if it's part of a const/let/var declaration (might be used later)
        if (/\b(?:const|let|var)\s+[\w$]+\s*=\s*$/.test(before)) {
          continue
        }

        // Skip if it's being assigned to a property
        if (/[\w$]+\s*=\s*$/.test(before)) {
          continue
        }

        // Skip if it's in a return statement
        if (/\breturn\s+$/.test(before)) {
          continue
        }

        // Skip if it's an argument to another function (might be handled there)
        if (/\(\s*$/.test(before) || /,\s*$/.test(before)) {
          continue
        }

        // Check if this is a standalone expression (not assigned or returned)
        // Look for statement-ending patterns
        const after = cleanedLine.slice(callIdx + match[0].length)

        // Find the end of this expression
        let parenDepth = 1 // We're inside the function call
        let endIdx = match[0].length
        while (endIdx < after.length && parenDepth > 0) {
          if (after[endIdx] === '(')
            parenDepth++
          else if (after[endIdx] === ')')
            parenDepth--
          endIdx++
        }

        // Check what comes after the function call
        const afterCall = after.slice(endIdx).trim()

        // If there's a .then, .catch, or .finally, it's handled
        if (/^\.(?:then|catch|finally)\s*\(/.test(afterCall)) {
          continue
        }

        // If it ends with semicolon or is end of line, it's floating
        if (afterCall === '' || afterCall.startsWith(';')) {
          const actualIdx = originalLine.indexOf(match[0])
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: actualIdx >= 0 ? actualIdx + 1 : callIdx + 1,
            ruleId: 'ts/no-floating-promises',
            message: 'Promise returned by this call is not handled. Add await, return, .catch(), or void.',
            severity: 'error',
            help: 'Either await the promise, return it, add .catch() to handle errors, or use void to explicitly mark as fire-and-forget',
          })
          break // Only report once per line
        }
      }
    }

    return issues
  },
}
