import type { RuleModule } from '../../types'

export const noMisusedPromisesRule: RuleModule = {
  meta: {
    docs: 'Disallow promises in places not designed to handle them (conditionals, logical expressions)',
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

      // Check 1: Promises in if conditions
      // Pattern: if (asyncFunction()) or if (!await asyncFunction())
      const ifMatch = cleanedLine.match(/\bif\s*\(\s*(!?)\s*([\w$]+\s*\([^)]*\))/)
      if (ifMatch) {
        const _negation = ifMatch[1]
        const call = ifMatch[2]

        // Check if it looks like an async function call
        if (/async|Async|fetch|Fetch|load|Load|get|Get|save|Save/.test(call)) {
          // Make sure it's not awaited
          const _beforeIf = cleanedLine.slice(0, cleanedLine.indexOf(ifMatch[0]))
          const insideIf = cleanedLine.slice(cleanedLine.indexOf('if (') + 4)

          if (!/\bawait\s/.test(insideIf)) {
            const actualIdx = originalLine.indexOf(call)
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: actualIdx >= 0 ? actualIdx + 1 : 1,
              ruleId: 'ts/no-misused-promises',
              message: 'Promise used in conditional expression without await. Promises are always truthy.',
              severity: 'error',
              help: 'Add await before the async call in the condition',
            })
          }
        }
      }

      // Check 2: Promises in logical expressions (&&, ||)
      // Pattern: promise && something or something || promise
      const promiseLikeCall = /(?:async|Async|fetch|Fetch|load|Load|get|Get|save|Save|Promise\.)[\w$]*\s*\([^)]*\)/g
      let match: RegExpExecArray | null

      // eslint-disable-next-line no-cond-assign
      while ((match = promiseLikeCall.exec(cleanedLine)) !== null) {
        const callIdx = match.index
        const call = match[0]

        // Look at context before and after the call
        const before = cleanedLine.slice(Math.max(0, callIdx - 10), callIdx)
        const after = cleanedLine.slice(callIdx + call.length, Math.min(cleanedLine.length, callIdx + call.length + 10))

        // Check if it's in a logical expression
        if (/(?:&&|\|\|)\s*$/.test(before) || /^\s*(?:&&|\|\|)/.test(after)) {
          // Make sure it's not awaited
          if (!/\bawait\s*$/.test(before)) {
            const actualIdx = originalLine.indexOf(call, Math.max(0, callIdx - 5))
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: actualIdx >= 0 ? actualIdx + 1 : callIdx + 1,
              ruleId: 'ts/no-misused-promises',
              message: 'Promise used in logical expression without await. This will not work as expected.',
              severity: 'error',
              help: 'Add await before the async call or restructure the logic',
            })
          }
        }

        // Check if it's in a ternary condition
        const beforeWider = cleanedLine.slice(Math.max(0, callIdx - 20), callIdx)
        if (/\?\s*$/.test(before) || /\?[^:]*$/.test(beforeWider)) {
          if (!/\bawait\s*$/.test(before)) {
            const actualIdx = originalLine.indexOf(call, Math.max(0, callIdx - 5))
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: actualIdx >= 0 ? actualIdx + 1 : callIdx + 1,
              ruleId: 'ts/no-misused-promises',
              message: 'Promise used in ternary expression without await.',
              severity: 'error',
              help: 'Add await before the async call',
            })
          }
        }
      }

      // Check 3: Promises in while/for conditions
      const whileMatch = cleanedLine.match(/\b(?:while|for)\s*\([^)]*(?:async|Async|fetch|Fetch|load|Load|get|Get)[\w$]*\s*\([^)]*\)/)
      if (whileMatch) {
        if (!/\bawait\s/.test(whileMatch[0])) {
          const actualIdx = originalLine.indexOf(whileMatch[0])
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: actualIdx >= 0 ? actualIdx + 1 : 1,
            ruleId: 'ts/no-misused-promises',
            message: 'Promise used in loop condition without await. This will cause unexpected behavior.',
            severity: 'error',
            help: 'Add await before the async call in the loop condition',
          })
        }
      }

      // Check 4: Promise passed to array methods that expect sync callbacks
      // Pattern: array.forEach(async () => ...) - forEach doesn't wait for async
      const forEachMatch = cleanedLine.match(/\.(forEach|map|filter|reduce|every|some|find|findIndex)\s*\(\s*async\s*(?:\(|[\w$]+\s*=>)/)
      if (forEachMatch) {
        const method = forEachMatch[1]
        // forEach is always problematic with async
        // map/filter/etc might be intentional but worth flagging
        if (method === 'forEach') {
          const actualIdx = originalLine.indexOf(forEachMatch[0])
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: actualIdx >= 0 ? actualIdx + 1 : 1,
            ruleId: 'ts/no-misused-promises',
            message: 'async callback in forEach - forEach does not wait for promises to resolve.',
            severity: 'error',
            help: 'Use for...of loop with await, or Promise.all() with map()',
          })
        }
      }
    }

    return issues
  },
}
