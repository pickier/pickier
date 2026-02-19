import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { createIssue, getPublishedField, parsePackageJson } from './utils'

export const hasModuleButNoExports: RuleModule = {
  meta: {
    docs: 'Suggest adding exports when module field is present',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []

    const [moduleValue, modulePath] = getPublishedField(pkg, 'module')
    const [exportsValue] = getPublishedField(pkg, 'exports')

    if (moduleValue != null && exportsValue == null) {
      return [createIssue(
        context.filePath,
        content,
        modulePath,
        'publint/has-module-but-no-exports',
        'pkg.module is used to output ESM, but pkg.exports is not defined. As Node.js doesn\'t read pkg.module, the ESM output may be skipped. Consider adding pkg.exports to export the ESM output.',
        'warning',
        'Node.js only reads "exports" for module resolution. Without it, the ESM entry point in "module" is ignored by Node.js.',
      )]
    }

    return []
  },
}
