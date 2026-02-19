import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { createIssue, parsePackageJson } from './utils'

export const useType: RuleModule = {
  meta: {
    docs: 'Suggest specifying the "type" field in package.json',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []

    if (pkg.type == null) {
      return [createIssue(
        context.filePath,
        content,
        ['name'],
        'publint/use-type',
        'The package does not specify the "type" field. Node.js may attempt to detect the package type causing a small performance hit. Consider adding "type": "commonjs" or "type": "module".',
        'warning',
        'Adding "type" helps Node.js resolve module format without detection overhead.',
      )]
    }

    return []
  },
}
