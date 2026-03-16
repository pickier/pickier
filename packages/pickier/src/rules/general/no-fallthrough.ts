import type { RuleModule } from '../../types'

export const noFallthroughRule: RuleModule = {
  meta: {
    docs: 'Disallow fallthrough of case statements',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    let inSwitch = false
    let lastCaseLine = -1
    let hasFallthrough = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Detect switch statement
      if (/\bswitch\s*\(/.test(trimmed)) {
        inSwitch = true
        continue
      }

      if (inSwitch) {
        // Check for case or default
        if (/^case\s+/.test(trimmed) || /^default\s*:/.test(trimmed)) {
          // If we had a previous case without break/return, that's a fallthrough
          if (lastCaseLine >= 0 && hasFallthrough) {
            // Check if there's a comment indicating intentional fallthrough
            const intentional = /\/\/.*falls?\s*through|\/\*.*falls?\s*through/i.test(lines[lastCaseLine])
              || (i > 0 && /\/\/.*falls?\s*through|\/\*.*falls?\s*through/i.test(lines[i - 1]))

            if (!intentional) {
              issues.push({
                filePath: ctx.filePath,
                line: lastCaseLine + 1,
                column: Math.max(1, lines[lastCaseLine].indexOf('case') + 1),
                ruleId: 'eslint/no-fallthrough',
                message: 'Expected a \'break\' statement before \'case\'',
                severity: 'error',
              })
            }
          }

          lastCaseLine = i
          hasFallthrough = true
        }

        // Check for break, return, throw, or continue
        if (/\b(?:break|return|throw|continue)\b/.test(trimmed)) {
          hasFallthrough = false
        }

        // Check for switch end
        if (trimmed === '}') {
          inSwitch = false
          lastCaseLine = -1
          hasFallthrough = false
        }
      }
    }

    return issues
  },
}
