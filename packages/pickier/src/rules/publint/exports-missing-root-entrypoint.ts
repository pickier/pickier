import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const exportsMissingRootEntrypoint: RuleModule = {
  meta: {
    docs: 'Ensure exports has a root entrypoint when main/module exist',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []

    const [mainValue] = getPublishedField(pkg, 'main')
    const [moduleValue] = getPublishedField(pkg, 'module')
    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')

    // Only check if main/module AND exports exist
    if ((mainValue == null && moduleValue == null) || exportsValue == null) return []

    // exports must be an object with subpath keys to be missing a root
    if (typeof exportsValue !== 'object' || Array.isArray(exportsValue)) return []

    const exportsKeys = Object.keys(exportsValue)
    if (exportsKeys.length === 0) return []

    // Check if exports contains subpath keys (start with '.')
    const hasSubpathKeys = exportsKeys[0]?.startsWith('.')
    if (!hasSubpathKeys) return [] // It's condition keys, not subpaths

    // Check if root entrypoint '.' exists
    if (exportsKeys.includes('.')) return []

    const mainFields: string[] = []
    if (mainValue) mainFields.push('main')
    if (moduleValue) mainFields.push('module')

    return [createIssue(
      context.filePath,
      content,
      exportsPath,
      'publint/exports-missing-root-entrypoint',
      `${formatPkgPath(exportsPath)} is missing the root entrypoint export, which is defined in pkg.${mainFields[0]}. Environments that support "exports" will ignore pkg.${mainFields[0]} as "exports" takes the highest priority.`,
      'warning',
      `Add ${formatPkgPath(exportsPath.concat('.'))} to ensure the root entrypoint is accessible.`,
    )]
  },
}
