import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const importsKeyInvalid: RuleModule = {
  meta: {
    docs: 'Ensure imports keys start with "#"',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    const [importsValue, importsPath] = getPublishedField(pkg, 'imports')
    if (importsValue == null || typeof importsValue !== 'object' || Array.isArray(importsValue)) return []

    for (const key of Object.keys(importsValue)) {
      if (!key.startsWith('#')) {
        const suggestKey = '#' + key.replace(/^[/]+/, '')
        const path = importsPath.concat(key)
        issues.push(createIssue(
          context.filePath,
          content,
          path,
          'publint/imports-key-invalid',
          `${formatPkgPath(path)} is invalid as the imports key does not start with "#". Use "${suggestKey}" instead.`,
          'error',
          'All imports keys must start with "#" to distinguish them from package specifiers.',
        ))
      }
    }

    return issues
  },
}
