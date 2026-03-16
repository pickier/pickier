import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match IIFEs without wrapping parens: function(){ ... }() or function(){ ... }.call()
const _IIFE_RE = /(?<!\()function\s*\([^)]*\)\s*\{/g
const _ARROW_IIFE_RE = /(?<!\()\([^)]*\)\s*=>\s*\{/g

export const wrapIifeRule: RuleModule = {
  meta: {
    docs: 'Require parentheses around immediately invoked function expressions (IIFEs)',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []

    // Simple heuristic: find `function(...){...}(` patterns
    // Look for function expressions immediately invoked
    const fnCallRe = /[^a-zA-Z_$](function\s*\([^)]*\)\s*\{[^}]*\})\s*\(/g
    let match

    while ((match = fnCallRe.exec(content)) !== null) {
      // Check if already wrapped: (function(){})()
      if (match.index > 0 && content[match.index] === '(')
        continue

      const lineNum = content.slice(0, match.index).split('\n').length
      const lastNewline = content.lastIndexOf('\n', match.index)
      const column = match.index - lastNewline

      issues.push({
        filePath: context.filePath,
        line: lineNum,
        column,
        ruleId: 'style/wrap-iife',
        message: 'Wrap immediately invoked function expressions in parentheses',
        severity: 'warning',
      })
    }

    return issues
  },
  fix(content: string): string {
    // Wrap unparenthesized IIFEs: function(){...}() -> (function(){...})()
    return content.replace(
      /([^a-zA-Z_$(\n])(function\s*\([^)]*\)\s*\{[^}]*\})\s*\(/g,
      '$1($2)(',
    )
  },
}
