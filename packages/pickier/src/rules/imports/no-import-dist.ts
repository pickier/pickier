import type { RuleModule } from '../../types'

export const noImportDistRule: RuleModule = {
  meta: { docs: 'Disallow importing from dist directories' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const re = new RegExp('^\\s*import\\s[^' + ';' + ']*?from\\s*[\'"]([^\'"]+)[\'"]', 'm')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const m = line.match(re)
      if (!m)
        continue
      const src = m[1]
      const isDist = (src === 'dist') || ((src.startsWith('.') || src.startsWith('/')) && /(?:^|\/)dist(?:\/.|$)/.test(src))
      if (isDist) {
        issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(src) + 1), ruleId: 'pickier/no-import-dist', message: `Do not import modules in \`dist\` folder, got ${src}`, severity: 'error' })
      }
    }
    return issues
  },
}
