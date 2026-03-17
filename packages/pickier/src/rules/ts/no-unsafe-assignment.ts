import type { RuleModule } from '../../types'

export const noUnsafeAssignmentRule: RuleModule = {
  meta: {
    docs: 'Disallow assignment of `any` typed values to variables - unsafe assignments bypass type checking',
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

      // Pattern 1: Type casts from any: (foo as any) or (<any>foo) being assigned
      const asCastPattern = /(\w+)\s+as\s+any/g
      let match: RegExpExecArray | null

      // eslint-disable-next-line no-cond-assign
      while ((match = asCastPattern.exec(cleanedLine)) !== null) {
        const varName = match[1]
        const castIdx = match.index

        // Check if this cast is being assigned to something
        const _after = cleanedLine.slice(castIdx + match[0].length).trim()
        const before = cleanedLine.slice(0, castIdx).trim()

        // If there's an assignment before this cast, it's being assigned
        if (/=\s*$/.test(before) && !/==|===|!=|!==/.test(before)) {
          const actualIdx = originalLine.indexOf(match[0])
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: actualIdx >= 0 ? actualIdx + 1 : castIdx + 1,
            ruleId: 'ts/no-unsafe-assignment',
            message: 'Unsafe assignment: value cast to `any` is being assigned. This bypasses type checking.',
            severity: 'error',
            help: 'Avoid casting to `any` or use a more specific type',
          })
        }
      }

      // Pattern 2: Function calls that return any (heuristic: common unsafe patterns)
      // Look for assignments from JSON.parse, eval, or other unsafe functions
      const unsafeFunctions = [
        'JSON.parse',
        'eval',
        'Function',
        'require',
      ]

      for (const unsafeFunc of unsafeFunctions) {
        const pattern = new RegExp(`\\b${unsafeFunc.replace('.', '\\.')}\\s*\\(`, 'g')
        pattern.lastIndex = 0

        // eslint-disable-next-line no-cond-assign
        while ((match = pattern.exec(cleanedLine)) !== null) {
          const callIdx = match.index
          const before = cleanedLine.slice(0, callIdx).trim()

          // Check if this is being assigned without type annotation
          // Pattern: const foo = JSON.parse(...)  (no type annotation)
          const assignMatch = before.match(/(?:const|let|var)\s+([\w$]+)\s*=\s*$/)
          if (assignMatch) {
            const varName = assignMatch[1]

            // Check if there's a type annotation on the same line or nearby
            // Look for : Type pattern
            const hasTypeAnnotation = new RegExp(`\\b${varName}\\s*:\\s*\\w+`).test(cleanedLine)

            if (!hasTypeAnnotation) {
              const actualIdx = originalLine.indexOf(match[0])
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: actualIdx >= 0 ? actualIdx + 1 : callIdx + 1,
                ruleId: 'ts/no-unsafe-assignment',
                message: `Unsafe assignment from ${unsafeFunc}() without type annotation. This function returns 'any'.`,
                severity: 'error',
                help: `Add a type annotation to ${varName} or use a type assertion with a specific type`,
              })
            }
          }

          // Also check for direct property assignment
          // Pattern: obj.foo = JSON.parse(...)
          const propAssignMatch = before.match(/([\w$.]+)\s*=\s*$/)
          if (propAssignMatch) {
            const actualIdx = originalLine.indexOf(match[0])
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: actualIdx >= 0 ? actualIdx + 1 : callIdx + 1,
              ruleId: 'ts/no-unsafe-assignment',
              message: `Unsafe assignment from ${unsafeFunc}() which returns 'any'.`,
              severity: 'error',
              help: 'Consider adding a type assertion with a specific type',
            })
          }
        }
      }

      // Pattern 3: Assigning from variables typed as any
      // This requires more context - we'll check for explicit any declarations
      const anyDeclPattern = /(?:const|let|var)\s+([\w$]+)\s*:\s*any\s*=/
      const anyDeclMatch = cleanedLine.match(anyDeclPattern)
      if (anyDeclMatch) {
        const varName = anyDeclMatch[1]
        const actualIdx = originalLine.indexOf(anyDeclMatch[0])
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: actualIdx >= 0 ? actualIdx + 1 : 1,
          ruleId: 'ts/no-unsafe-assignment',
          message: `Variable '${varName}' is explicitly typed as 'any'. This defeats TypeScript's type safety.`,
          severity: 'error',
          help: 'Use a more specific type or `unknown` instead of `any`',
        })
      }

      // Pattern 4: Array/Object destructuring from any
      // const { foo } = anyTypedObject
      // This is harder to detect without type info, so we'll flag common patterns
      const destructurePattern = /(?:const|let|var)\s+(?:\{[^}]+\}|\[[^\]]+\])\s*=\s*([\w$]+)/
      const destructMatch = cleanedLine.match(destructurePattern)
      if (destructMatch) {
        const source = destructMatch[1]
        // Check if source looks like it might be any-typed (heuristic)
        // Look for common any-typed sources
        if (/^(?:params|query|body|req|res|response|data|result)$/.test(source)) {
          // These are commonly any-typed in web apps - warn about them
          // But this might be too noisy, so we'll skip this check for now
          // Uncomment if desired:
          // const actualIdx = originalLine.indexOf(destructMatch[0])
          // issues.push({
          //   filePath: ctx.filePath,
          //   line: i + 1,
          //   column: actualIdx >= 0 ? actualIdx + 1 : 1,
          //   ruleId: 'ts/no-unsafe-assignment',
          //   message: `Destructuring from '${source}' which may be typed as 'any'. Consider adding type assertions.`,
          //   severity: 'warning',
          //   help: 'Add type annotations to ensure type safety',
          // })
        }
      }
    }

    return issues
  },
}
