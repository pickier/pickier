import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { createIssue, parsePackageJson } from './utils'

export const deprecatedFieldJsnext: RuleModule = {
  meta: {
    docs: 'Disallow deprecated jsnext:main and jsnext fields',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    if (pkg['jsnext:main'] != null) {
      issues.push(createIssue(
        context.filePath,
        content,
        ['jsnext:main'],
        'publint/deprecated-field-jsnext',
        'pkg["jsnext:main"] is deprecated. pkg.module should be used instead.',
        'warning',
        'The jsnext:main field is no longer recognized by modern bundlers. Use "module" instead.',
      ))
    }

    if (pkg.jsnext != null) {
      issues.push(createIssue(
        context.filePath,
        content,
        ['jsnext'],
        'publint/deprecated-field-jsnext',
        'pkg.jsnext is deprecated. pkg.module should be used instead.',
        'warning',
        'The jsnext field is no longer recognized by modern bundlers. Use "module" instead.',
      ))
    }

    return issues
  },
}
