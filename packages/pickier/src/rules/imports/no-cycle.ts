import type { RuleModule } from '../../types'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const noCycleRule: RuleModule = {
  meta: {
    docs: 'Ensure imports don\'t create circular dependencies',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    const currentFile = ctx.filePath
    const visited = new Set<string>()
    const stack = new Set<string>()

    function detectCycle(filePath: string, importChain: string[]): boolean {
      if (stack.has(filePath)) {
        // Found a cycle
        return true
      }

      if (visited.has(filePath)) {
        return false
      }

      visited.add(filePath)
      stack.add(filePath)

      try {
        const content = readFileSync(filePath, 'utf8')
        const imports = extractImports(content, dirname(filePath))

        for (const imp of imports) {
          if (detectCycle(imp, [...importChain, imp])) {
            return true
          }
        }
      }
      catch {
        // File doesn't exist or can't be read
      }

      stack.delete(filePath)
      return false
    }

    function extractImports(content: string, baseDir: string): string[] {
      const imports: string[] = []
      const importRegex = /\bimport(?:\s{2,}|\s+\S.*?(?:[\n\r\u2028\u2029]\s*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]))from\s+['"]([^'"]+)['"]/g

      let match
      for (match = importRegex.exec(content); match !== null; match = importRegex.exec(content)) {
        const importPath = match[1]

        // Only check relative imports
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          const extensions = ['.ts', '.tsx', '.js', '.jsx', '']
          for (const ext of extensions) {
            const fullPath = resolve(baseDir, importPath + ext)
            if (existsSync(fullPath)) {
              imports.push(fullPath)
              break
            }
          }
        }
      }

      return imports
    }

    // Check all imports from current file
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const importMatch = line.match(/\bimport(?:\s{2,}|\s+\S.*?(?:[\n\r\u2028\u2029]\s*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]))from\s+['"]([^'"]+)['"]/)
      if (importMatch) {
        const importPath = importMatch[1]

        // Only check relative imports
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          const extensions = ['.ts', '.tsx', '.js', '.jsx', '']
          let resolvedPath = ''

          for (const ext of extensions) {
            const fullPath = resolve(dirname(currentFile), importPath + ext)
            if (existsSync(fullPath)) {
              resolvedPath = fullPath
              break
            }
          }

          if (resolvedPath) {
            visited.clear()
            stack.clear()
            stack.add(currentFile)

            if (detectCycle(resolvedPath, [currentFile, resolvedPath])) {
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: 1,
                ruleId: 'import/no-cycle',
                message: `Dependency cycle detected`,
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
