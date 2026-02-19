import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { crawlExportsOrImports, createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const importsValueInvalid: RuleModule = {
  meta: {
    docs: 'Ensure imports values start with "./"',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    const [importsValue, importsPath] = getPublishedField(pkg, 'imports')
    if (importsValue == null || typeof importsValue !== 'object') return []

    crawlExportsOrImports(importsValue, importsPath, true, (value, ctx) => {
      if (typeof value !== 'string') return
      // imports can reference external packages (not starting with '.')
      if (!value.startsWith('.')) return
      if (value.startsWith('./')) return

      const suggestValue = './' + value.replace(/^[/]+/, '')
      issues.push(createIssue(
        context.filePath,
        content,
        ctx.path,
        'publint/imports-value-invalid',
        `${formatPkgPath(ctx.path)} is "${value}" which is invalid as it does not start with "./". Use "${suggestValue}" instead.`,
        'error',
        'Relative imports values must start with "./".',
      ))
    })

    return issues
  },
}
