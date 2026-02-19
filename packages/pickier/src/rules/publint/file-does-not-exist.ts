import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { existsSync } from 'node:fs'
import { crawlExportsOrImports, createIssue, formatPkgPath, getPkgDir, getPublishedField, parsePackageJson, resolvePkgPath } from './utils'

export const fileDoesNotExist: RuleModule = {
  meta: {
    docs: 'Ensure files referenced in package.json exist',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []
    const pkgDir = getPkgDir(context.filePath)

    // Check simple string fields
    const stringFields = ['main', 'module', 'types', 'typings', 'unpkg', 'jsdelivr']
    for (const field of stringFields) {
      const [value, path] = getPublishedField(pkg, field)
      if (value == null || typeof value !== 'string') continue

      const resolved = resolvePkgPath(pkgDir, value)
      if (!fileExistsWithFallbacks(resolved)) {
        issues.push(createIssue(
          context.filePath,
          content,
          path,
          'publint/file-does-not-exist',
          `${formatPkgPath(path)} is "${value}" but the file does not exist.`,
          'error',
          'The referenced file path cannot be found. Check the path for typos.',
        ))
      }
    }

    // Check bin field
    const [binValue, binPath] = getPublishedField(pkg, 'bin')
    if (binValue != null) {
      if (typeof binValue === 'string') {
        checkFileRef(binValue, binPath, issues, context.filePath, content, pkgDir)
      }
      else if (typeof binValue === 'object') {
        for (const key of Object.keys(binValue)) {
          if (typeof binValue[key] === 'string') {
            checkFileRef(binValue[key], binPath.concat(key), issues, context.filePath, content, pkgDir)
          }
        }
      }
    }

    // Check exports string values
    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')
    if (exportsValue != null) {
      crawlExportsOrImports(exportsValue, exportsPath, false, (value, ctx) => {
        if (typeof value !== 'string') return
        if (!value.startsWith('./') && !value.startsWith('../')) return
        if (value.includes('*')) return // Skip glob patterns

        const resolved = resolvePkgPath(pkgDir, value)
        if (!existsSync(resolved)) {
          issues.push(createIssue(
            context.filePath,
            content,
            ctx.path,
            'publint/file-does-not-exist',
            `${formatPkgPath(ctx.path)} is "${value}" but the file does not exist.`,
            'error',
            'The referenced file path cannot be found. Check the path for typos.',
          ))
        }
      })
    }

    return issues
  },
}

function checkFileRef(
  value: string,
  path: string[],
  issues: LintIssue[],
  filePath: string,
  content: string,
  pkgDir: string,
): void {
  const resolved = resolvePkgPath(pkgDir, value)
  if (!fileExistsWithFallbacks(resolved)) {
    issues.push(createIssue(
      filePath,
      content,
      path,
      'publint/file-does-not-exist',
      `${formatPkgPath(path)} is "${value}" but the file does not exist.`,
      'error',
      'The referenced file path cannot be found. Check the path for typos.',
    ))
  }
}

function fileExistsWithFallbacks(resolved: string): boolean {
  if (existsSync(resolved)) return true
  // Try common fallback extensions
  if (existsSync(resolved + '.js')) return true
  if (existsSync(resolved + '/index.js')) return true
  return false
}
