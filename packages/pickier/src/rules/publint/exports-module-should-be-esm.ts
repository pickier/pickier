import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { existsSync, readFileSync } from 'node:fs'
import { crawlExportsOrImports, createIssue, formatPkgPath, getCodeFormat, getPkgDir, getPublishedField, isLintableFilePath, parsePackageJson, resolvePkgPath } from './utils'

export const exportsModuleShouldBeEsm: RuleModule = {
  meta: {
    docs: 'Ensure files under "module" condition in exports are ESM',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []
    const pkgDir = getPkgDir(context.filePath)

    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')
    if (exportsValue == null) return []

    crawlExportsOrImports(exportsValue, exportsPath, false, (value, ctx) => {
      if (typeof value !== 'string') return
      // Only check files under a "module" condition
      if (!ctx.path.includes('module')) return
      if (!value.startsWith('./') && !value.startsWith('../')) return
      if (value.includes('*')) return

      const resolved = resolvePkgPath(pkgDir, value)
      if (!existsSync(resolved)) return
      if (!isLintableFilePath(value)) return

      let fileContent: string
      try {
        fileContent = readFileSync(resolved, 'utf8')
      }
      catch {
        return
      }

      const actualFormat = getCodeFormat(fileContent)
      if (actualFormat === 'CJS') {
        issues.push(createIssue(
          context.filePath,
          content,
          ctx.path,
          'publint/exports-module-should-be-esm',
          `${formatPkgPath(ctx.path)} should be ESM, but the code is written in CJS.`,
          'error',
          'The "module" condition is only used by bundlers and must contain ESM code.',
        ))
      }
    })

    // Also check imports
    const [importsValue, importsPath] = getPublishedField(pkg, 'imports')
    if (importsValue != null && typeof importsValue === 'object') {
      crawlExportsOrImports(importsValue, importsPath, true, (value, ctx) => {
        if (typeof value !== 'string') return
        if (!ctx.path.includes('module')) return
        if (!value.startsWith('./')) return
        if (value.includes('*')) return

        const resolved = resolvePkgPath(pkgDir, value)
        if (!existsSync(resolved)) return
        if (!isLintableFilePath(value)) return

        let fileContent: string
        try {
          fileContent = readFileSync(resolved, 'utf8')
        }
        catch {
          return
        }

        const actualFormat = getCodeFormat(fileContent)
        if (actualFormat === 'CJS') {
          issues.push(createIssue(
            context.filePath,
            content,
            ctx.path,
            'publint/exports-module-should-be-esm',
            `${formatPkgPath(ctx.path)} should be ESM, but the code is written in CJS.`,
            'error',
            'The "module" condition is only used by bundlers and must contain ESM code.',
          ))
        }
      })
    }

    return issues
  },
}
