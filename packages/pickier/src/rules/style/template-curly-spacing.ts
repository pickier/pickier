import type { LintIssue, RuleContext, RuleModule } from '../../types'

const DOLLAR_BRACE = '$' + '{'

export const templateCurlySpacingRule: RuleModule = {
  meta: {
    docs: 'Disallow spaces inside template literal interpolation curly braces',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Find ${ with space after
      for (let idx = line.indexOf(DOLLAR_BRACE, 0); idx !== -1; idx = line.indexOf(DOLLAR_BRACE, idx)) {
        const afterOpen = idx + 2
        if (afterOpen < line.length && (line[afterOpen] === ' ' || line[afterOpen] === '\t')) {
          // Check we're likely inside a template literal by counting backticks before
          const before = line.slice(0, idx)
          const backticks = (before.match(/`/g) || []).length
          if (backticks % 2 === 1) {
            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: afterOpen + 1,
              ruleId: 'style/template-curly-spacing',
              message: `Unexpected space after '\${'`,
              severity: 'warning',
            })
          }
        }

        // Find matching }
        let depth = 1
        let closeIdx = afterOpen
        while (closeIdx < line.length && depth > 0) {
          if (line[closeIdx] === '{')
            depth++
          if (line[closeIdx] === '}')
            depth--
          if (depth > 0)
            closeIdx++
        }

        if (depth === 0 && closeIdx > 0) {
          const beforeClose = line[closeIdx - 1]
          if (beforeClose === ' ' || beforeClose === '\t') {
            const before = line.slice(0, idx)
            const backticks = (before.match(/`/g) || []).length
            if (backticks % 2 === 1) {
              issues.push({
                filePath: context.filePath,
                line: i + 1,
                column: closeIdx,
                ruleId: 'style/template-curly-spacing',
                message: 'Unexpected space before \'}\'',
                severity: 'warning',
              })
            }
          }
        }

        idx = afterOpen
      }
    }

    return issues
  },
  fix(content: string): string {
    // Remove spaces inside ${ ... } in template literals
    // Only target ${ expr } patterns to avoid breaking other constructs
    return content.replace(/\$\{\s+([^}]*?)\s+\}/g, '$' + '{$1}')
  },
}
