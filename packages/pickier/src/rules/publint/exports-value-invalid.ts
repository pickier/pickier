import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { crawlExportsOrImports, createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const exportsValueInvalid: RuleModule = {
  meta: {
    docs: 'Ensure exports values start with "./"',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')
    if (exportsValue == null) return []

    crawlExportsOrImports(exportsValue, exportsPath, false, (value, ctx) => {
      if (typeof value !== 'string') return
      if (value.startsWith('./')) return

      const suggestValue = './' + value.replace(/^[/]+/, '')
      issues.push(createIssue(
        context.filePath,
        content,
        ctx.path,
        'publint/exports-value-invalid',
        `${formatPkgPath(ctx.path)} is "${value}" which is invalid as it does not start with "./". Use "${suggestValue}" instead.`,
        'error',
        'All exports values must be relative paths starting with "./".',
      ))
    })

    return issues
  },
}
