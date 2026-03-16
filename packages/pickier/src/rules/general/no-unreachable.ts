import type { RuleModule } from '../../types'

export const noUnreachableRule: RuleModule = {
  meta: {
    docs: 'Disallow unreachable code after return, throw, continue, or break',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const _trimmed = line.trim()

      // Check for return, throw, break, continue statements
      if (/^\s*(?:return|throw|break|continue)\b/.test(line)) {
        // Look at the next non-empty, non-comment line
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j]
          const nextTrimmed = nextLine.trim()

          // Skip empty lines and comments
          if (nextTrimmed === '' || nextTrimmed.startsWith('//') || nextTrimmed.startsWith('/*'))
            continue

          // Check if it's a closing brace (end of block) - this is reachable
          if (nextTrimmed === '}' || nextTrimmed.startsWith('}'))
            break

          // Check if it's a case or default label - this is reachable
          if (/^(?:case\b|default\s*:)/.test(nextTrimmed))
            break

          // Otherwise, it's unreachable code
          issues.push({
            filePath: ctx.filePath,
            line: j + 1,
            column: Math.max(1, nextLine.search(/\S/) + 1),
            ruleId: 'eslint/no-unreachable',
            message: 'Unreachable code',
            severity: 'error',
          })
          break // Only report the first unreachable line
        }
      }
    }

    return issues
  },
}
