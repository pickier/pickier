import type { RuleModule } from '../../types'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

/**
 * The file a relative import resolves to, as Bun and Node look for it: the
 * path with a code extension or as written, then a directory's index file.
 * Null when there is none - a directory is never read as a file.
 */
function resolveImport(fromDir: string, importPath: string): string | null {
  const base = resolve(fromDir, importPath)
  for (const ext of [...EXTENSIONS, '']) {
    if (isFile(base + ext))
      return base + ext
  }
  for (const ext of EXTENSIONS) {
    const index = join(base, `index${ext}`)
    if (isFile(index))
      return index
  }
  return null
}

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
        const target = resolveImport(currentDir, importPath)
        let targetContent = ''
        if (target) {
          try {
            targetContent = readFileSync(target, 'utf8')
          }
          catch {
            // Unreadable: nothing to check against
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
