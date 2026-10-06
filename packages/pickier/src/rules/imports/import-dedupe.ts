import type { RuleModule } from '../../types'

export const importDedupeRule: RuleModule = {
  meta: { docs: 'Disallow duplicate specifier names in a single import declaration' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // The pattern needs the word; most lines do not have it
      if (!line.includes('import'))
        continue
      const m = line.match(/^\s*import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/)
      if (!m)
        continue
      const inner = m[1]
      const names = inner.split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(/\s+as\s+/i)[0].trim())
      const seen = new Set<string>()
      for (const n of names) {
        if (seen.has(n)) {
          issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(n) + 1), ruleId: 'pickier/import-dedupe', message: 'Expect no duplication in imports', severity: 'warning' })
          break
        }
        seen.add(n)
      }
    }

    return issues
  },
}
