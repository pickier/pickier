import type { RuleModule } from '../../types'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const namedRule: RuleModule = {
  meta: {
    docs: 'Ensure named imports correspond to a named export in the remote file',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    const currentDir = dirname(ctx.filePath)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match named imports: import { foo, bar } from './module'
      const namedImportMatch = line.match(/\bimport\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/)

      if (namedImportMatch) {
        const namedImports = namedImportMatch[1]
          .split(',')
          .map(s => s.trim().split(/\s+as\s+/)[0].trim())
        const importPath = namedImportMatch[2]

        // Skip non-relative imports
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          continue
        }

        // Try to resolve and read the imported file
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '']
        let targetContent = ''

        for (const ext of extensions) {
          const fullPath = resolve(currentDir, importPath + ext)
          if (existsSync(fullPath)) {
            targetContent = readFileSync(fullPath, 'utf8')
            break
          }
        }

        if (targetContent) {
          // Check if each named import is exported
          for (const importName of namedImports) {
            // eslint-disable-next-line eslint/no-new
            const exportDecl = new RegExp(`\\bexport\\s+(?:const|let|var|function|class)\\s+${importName}\\b`)
            // eslint-disable-next-line eslint/no-new
            const exportReExport = new RegExp(`\\bexport\\s+\\{[^}]*\\b${importName}\\b[^}]*\\}`)
            const exportPatterns = [
              exportDecl,
              exportReExport,
            ]

            const isExported = exportPatterns.some(pattern => pattern.test(targetContent))

            if (!isExported) {
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: 1,
                ruleId: 'import/named',
                message: `'${importName}' not found in '${importPath}'`,
                severity: 'error',
              })
            }
          }
        }
      }
    }

    return issues
  },
}
