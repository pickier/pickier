import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { createIssue, formatPkgPath, getPublishedField, parsePackageJson } from './utils'

interface FieldTypeCheck {
  field: string
  expectTypes: string[]
}

const FIELD_TYPE_CHECKS: FieldTypeCheck[] = [
  { field: 'main', expectTypes: ['string'] },
  { field: 'module', expectTypes: ['string'] },
  { field: 'types', expectTypes: ['string'] },
  { field: 'typings', expectTypes: ['string'] },
  { field: 'browser', expectTypes: ['string', 'object'] },
  { field: 'bin', expectTypes: ['string', 'object'] },
  { field: 'exports', expectTypes: ['string', 'object'] },
  { field: 'imports', expectTypes: ['object'] },
  { field: 'name', expectTypes: ['string'] },
  { field: 'version', expectTypes: ['string'] },
  { field: 'description', expectTypes: ['string'] },
  { field: 'license', expectTypes: ['string'] },
]

export const fieldInvalidValueType: RuleModule = {
  meta: {
    docs: 'Ensure package.json fields have correct value types',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []

    for (const { field, expectTypes } of FIELD_TYPE_CHECKS) {
      const [value, path] = getPublishedField(pkg, field)
      if (value == null) continue

      const actualType = typeof value
      if (!expectTypes.includes(actualType)) {
        const expectStr = expectTypes.length === 1
          ? expectTypes[0]
          : `${expectTypes.slice(0, -1).join(', ')} or ${expectTypes[expectTypes.length - 1]}`

        issues.push(createIssue(
          context.filePath,
          content,
          path,
          'publint/field-invalid-value-type',
          `${formatPkgPath(path)} has an invalid ${actualType} type. Expected a ${expectStr} type instead.`,
          'error',
          `The "${field}" field must be of type ${expectStr}.`,
        ))
      }
    }

    return issues
  },
}
