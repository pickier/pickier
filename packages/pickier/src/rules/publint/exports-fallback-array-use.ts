import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { crawlExportsOrImports, createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const exportsFallbackArrayUse: RuleModule = {
  meta: {
    docs: 'Warn against using fallback arrays in exports',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')
    if (exportsValue == null) return []

    crawlExportsOrImports(exportsValue, exportsPath, false, (value, ctx) => {
      if (!Array.isArray(value)) return

      issues.push(createIssue(
        context.filePath,
        content,
        ctx.path,
        'publint/exports-fallback-array-use',
        `${formatPkgPath(ctx.path)} uses fallback arrays which is not recommended. It works differently in some tools and may face inconsistent behaviors.`,
        'warning',
        'Fallback arrays pick the first parseable value and have no practical use case in Node.js currently.',
      ))
    })

    return issues
  },
}
