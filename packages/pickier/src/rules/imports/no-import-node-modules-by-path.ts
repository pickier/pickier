import type { RuleModule } from '../../types'

export const noImportNodeModulesByPathRule: RuleModule = {
  meta: { docs: 'Disallow importing from node_modules by explicit path' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const importRe = new RegExp('^\\s*import\\s[^' + ';' + ']*?from\\s*[\'"]([^\'"]+)[\'"]', 'm')
    const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const mi = line.match(importRe)
      const mr = line.match(requireRe)
      const src = (mi?.[1] || mr?.[1]) as string | undefined
      if (!src)
        continue
      if (src.includes('/node_modules/')) {
        const col = Math.max(1, line.indexOf(src) + 1)
        issues.push({ filePath: ctx.filePath, line: i + 1, column: col, ruleId: 'pickier/no-import-node-modules-by-path', message: 'Do not import modules in `node_modules` folder by path', severity: 'error' })
      }
    }

    return issues
  },
}
