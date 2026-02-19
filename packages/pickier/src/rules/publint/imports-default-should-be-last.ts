import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { crawlExportsOrImports, createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const importsDefaultShouldBeLast: RuleModule = {
  meta: {
    docs: 'Ensure "default" condition is last in imports objects',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    const [importsValue, importsPath] = getPublishedField(pkg, 'imports')
    if (importsValue == null || typeof importsValue !== 'object') return []

    crawlExportsOrImports(importsValue, importsPath, true, (value, ctx, objectKeys) => {
      if (!objectKeys || typeof value !== 'object' || Array.isArray(value)) return
      if (!('default' in value)) return

      if (objectKeys[objectKeys.length - 1] !== 'default') {
        issues.push(createIssue(
          context.filePath,
          content,
          ctx.path.concat('default'),
          'publint/imports-default-should-be-last',
          `${formatPkgPath(ctx.path.concat('default'))} should be the last condition in the object so it doesn't take precedence over the keys following it.`,
          'error',
          'Conditions are resolved in order. "default" acts as a fallback and should come last.',
        ))
      }
    })

    return issues
  },
}
