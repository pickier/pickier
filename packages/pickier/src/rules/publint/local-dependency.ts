import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { createIssue, parsePackageJson } from './utils'

export const localDependency: RuleModule = {
  meta: {
    docs: 'Disallow local file references in dependencies',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    if (pkg.dependencies && typeof pkg.dependencies === 'object') {
      for (const depName of Object.keys(pkg.dependencies)) {
        const depVersion = pkg.dependencies[depName]
        if (typeof depVersion === 'string' && (depVersion.startsWith('file:') || depVersion.startsWith('link:'))) {
          issues.push(createIssue(
            context.filePath,
            content,
            ['dependencies', depName],
            'publint/local-dependency',
            `The "${depName}" dependency references "${depVersion}" that will likely not work when installed by end-users.`,
            'error',
            'Local file references (file: or link:) are not portable and will fail for consumers of the package.',
          ))
        }
      }
    }

    return issues
  },
}
