import type { RuleModule } from '../../types'

export const preferOptionalChainRule: RuleModule = {
  meta: {
    docs: 'Prefer optional chaining (?.) over chained logical AND (&&) for property access',
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

      // Look for patterns like: obj && obj.prop or obj.a && obj.a.b
      // Pattern 1: foo && foo.bar
      const pattern1 = /(\b[\w$]+)\s*&&\s*\1\.([\w$]+)/g
      let match: RegExpExecArray | null

      // eslint-disable-next-line no-cond-assign
      while ((match = pattern1.exec(cleanedLine)) !== null) {
        const varName = match[1]
        const propName = match[2]
        const idx = match.index

        const actualIdx = originalLine.indexOf(match[0], Math.max(0, idx - 5))
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: actualIdx >= 0 ? actualIdx + 1 : idx + 1,
          ruleId: 'ts/prefer-optional-chain',
          message: `Prefer optional chaining over && for property access: ${varName}?.${propName}`,
          severity: 'error',
          help: `Use \`${varName}?.${propName}\` instead of \`${varName} && ${varName}.${propName}\``,
        })
      }

      // Pattern 2: obj.a && obj.a.b (chained property access)
      const pattern2 = /([\w$.]+)\s*&&\s*\1\.([\w$]+)/g
      pattern2.lastIndex = 0

      // eslint-disable-next-line no-cond-assign
      while ((match = pattern2.exec(cleanedLine)) !== null) {
        const chain = match[1]
        const nextProp = match[2]
        const idx = match.index

        const actualIdx = originalLine.indexOf(match[0], Math.max(0, idx - 5))
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: actualIdx >= 0 ? actualIdx + 1 : idx + 1,
          ruleId: 'ts/prefer-optional-chain',
          message: `Prefer optional chaining over && for nested property access: ${chain}?.${nextProp}`,
          severity: 'error',
          help: `Use \`${chain}?.${nextProp}\` instead of \`${chain} && ${chain}.${nextProp}\``,
        })
      }

      // Pattern 3: Multiple chained checks: a && a.b && a.b.c
      // This is more complex - look for repeated prefixes
      const andSplit = cleanedLine.split(/\s*&&\s*/)
      if (andSplit.length >= 3) {
        // Check if we have a chain like: foo, foo.bar, foo.bar.baz
        for (let j = 0; j < andSplit.length - 2; j++) {
          const part1 = andSplit[j].trim()
          const part2 = andSplit[j + 1].trim()
          const part3 = andSplit[j + 2].trim()

          // Check if part2 starts with part1 and part3 starts with part2
          if (part2.startsWith(`${part1}.`) && part3.startsWith(`${part2}.`)) {
            const actualIdx = originalLine.indexOf(part1)
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: actualIdx >= 0 ? actualIdx + 1 : 1,
              ruleId: 'ts/prefer-optional-chain',
              message: 'Prefer optional chaining over multiple && checks for nested properties',
              severity: 'error',
              help: `Use optional chaining like \`${part1}?.${part2.slice(part1.length + 1)}?.${part3.slice(part2.length + 1)}\``,
            })
            break // Only report once per line
          }
        }
      }
    }

    return issues
  },
  fix: (text) => {
    // Auto-fix simple patterns
    const lines = text.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      let fixedLine = line

      // Fix pattern: foo && foo.bar => foo?.bar
      fixedLine = fixedLine.replace(
        /(\b[\w$]+)\s*&&\s*\1\.([\w$]+)/g,
        '$1?.$2',
      )

      // Fix pattern: obj.a && obj.a.b => obj.a?.b
      fixedLine = fixedLine.replace(
        /([\w$.]+)\s*&&\s*\1\.([\w$]+)/g,
        '$1?.$2',
      )

      result.push(fixedLine)
    }

    return result.join('\n')
  },
}
