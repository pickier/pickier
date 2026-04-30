import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD044 - Proper names should have the correct capitalization
 */
export const properNamesRule: RuleModule = {
  meta: {
    docs: 'Proper names should have correct capitalization',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { names?: string[], code_blocks?: boolean }) || {}
    const properNames = options.names || []
    const checkCodeBlocks = options.code_blocks !== false

    if (properNames.length === 0) {
      return issues // No proper names configured
    }

    // Use the proper CommonMark-aware tracker so nested 4-tick fences and
    // ``` openers with info strings (e.g. ` ```js `) don't corrupt the
    // in-code-block tracking.
    const inCode = getCodeBlockLines(lines)

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i) && !checkCodeBlocks)
        continue
      const line = lines[i]

      // Check each proper name
      for (const properName of properNames) {
        const regex = new RegExp(`\\b${properName}\\b`, 'gi')
        const matches = line.matchAll(regex)

        for (const match of matches) {
          if (match[0] !== properName) {
            const column = match.index! + 1
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column,
              ruleId: 'markdown/proper-names',
              message: `Incorrect capitalization of '${match[0]}', should be '${properName}'`,
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
}
