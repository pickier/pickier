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

    // Consumers install dependencies, optionalDependencies, and
    // peerDependencies — a file:/link: reference in any of them breaks for
    // them. devDependencies are excluded (not installed by consumers).
    const fields = ['dependencies', 'optionalDependencies', 'peerDependencies']
    for (const field of fields) {
      const deps = pkg[field]
      if (!deps || typeof deps !== 'object')
        continue
      for (const depName of Object.keys(deps)) {
        const depVersion = deps[depName]
        if (typeof depVersion === 'string' && (depVersion.startsWith('file:') || depVersion.startsWith('link:'))) {
          issues.push(createIssue(
            context.filePath,
            content,
            [field, depName],
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
