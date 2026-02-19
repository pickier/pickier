import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { crawlExportsOrImports, createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const exportsModuleShouldPrecedeRequire: RuleModule = {
  meta: {
    docs: 'Ensure "module" condition precedes "require" in exports',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')
    if (exportsValue == null) return []

    crawlExportsOrImports(exportsValue, exportsPath, false, (value, ctx, objectKeys) => {
      if (!objectKeys || typeof value !== 'object' || Array.isArray(value)) return
      if (!('module' in value) || !('require' in value)) return

      if (objectKeys.indexOf('module') > objectKeys.indexOf('require')) {
        issues.push(createIssue(
          context.filePath,
          content,
          ctx.path.concat('module'),
          'publint/exports-module-should-precede-require',
          `${formatPkgPath(ctx.path.concat('module'))} should come before the "require" condition so it can take precedence when used by a bundler.`,
          'error',
          'Bundlers prioritize conditions by order. "module" should precede "require" to ensure ESM is preferred.',
        ))
      }
    })

    return issues
  },
}
