import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { crawlExportsOrImports, createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

export const exportsTypesShouldBeFirst: RuleModule = {
  meta: {
    docs: 'Ensure "types" condition is first in exports objects',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')
    if (exportsValue == null) return []

    crawlExportsOrImports(exportsValue, exportsPath, false, (value, ctx, objectKeys) => {
      if (!objectKeys || typeof value !== 'object' || Array.isArray(value)) return
      if (!('types' in value)) return

      const typesIndex = objectKeys.indexOf('types')
      if (typesIndex === 0) return // Already first

      // Check if preceding keys are versioned types (e.g. "types@>=5.0")
      // or nested conditions that already have types
      const precedingKeys = objectKeys.slice(0, typesIndex).filter((key) => {
        if (key.startsWith('types')) return false
        // Check if preceding condition has nested types
        if (typeof value[key] === 'object' && value[key] !== null && objectHasKeyNested(value[key], 'types')) {
          return false
        }
        return true
      })

      if (precedingKeys.length > 0) {
        issues.push(createIssue(
          context.filePath,
          content,
          ctx.path.concat('types'),
          'publint/exports-types-should-be-first',
          `${formatPkgPath(ctx.path.concat('types'))} should be the first condition in the object so it can be resolved by TypeScript.`,
          'error',
          'TypeScript resolves conditions in order. The "types" condition must come first to ensure correct type resolution.',
        ))
      }
    })

    return issues
  },
}

function objectHasKeyNested(obj: Record<string, any>, key: string): boolean {
  for (const k in obj) {
    if (k === key) return true
    if (typeof obj[k] === 'object' && obj[k] !== null && objectHasKeyNested(obj[k], key)) return true
  }
  return false
}
