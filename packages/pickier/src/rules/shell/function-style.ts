import type { RuleModule } from '../../types'

/**
 * Enforce consistent function declaration style in shell scripts.
 * Default: prefer `name() {` over `function name {` (POSIX-compatible).
 */
export const functionStyleRule: RuleModule = {
  meta: {
    docs: 'Enforce consistent function declaration style',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?/)
      if (heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch[1]
      }

      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Match `function name` with or without parens
      const funcKeywordMatch = trimmed.match(/^function\s+(\w+)\s*(?:\(\s*\))?\s*\{?\s*$/)
      if (funcKeywordMatch) {
        const funcName = funcKeywordMatch[1]
        const col = line.indexOf('function')
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: col + 1,
          ruleId: 'shell/function-style',
          message: `Use \`${funcName}() {\` instead of \`function ${funcName}\` — POSIX-compatible style`,
          severity: 'warning',
          help: `Replace with: ${funcName}() {`,
        })
      }
    }
    return issues
  },
  fix(content) {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      // Replace `function name {` or `function name() {` with `name() {`
      const match = line.match(/^(\s*)function\s+(\w+)\s*(?:\(\s*\))?\s*(\{?\s*)$/)
      if (match) {
        const [, indent, name, brace] = match
        result.push(`${indent}${name}() ${brace || '{'}`)
      }
      else {
        result.push(line)
      }
    }
    return result.join('\n')
  },
}
