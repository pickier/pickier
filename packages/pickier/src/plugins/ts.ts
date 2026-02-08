import type { PickierPlugin } from '../types'
import { memberDelimiterStyleRule } from '../rules/ts/member-delimiter-style'
import { noExplicitAnyRule } from '../rules/ts/no-explicit-any'
import { noFloatingPromisesRule } from '../rules/ts/no-floating-promises'
import { noMisusedPromisesRule } from '../rules/ts/no-misused-promises'
import { noRequireImportsRule } from '../rules/ts/no-require-imports'
import { noTopLevelAwaitRule } from '../rules/ts/no-top-level-await'
import { noTsExportEqualRule } from '../rules/ts/no-ts-export-equal'
import { noUnsafeAssignmentRule } from '../rules/ts/no-unsafe-assignment'
import { preferNullishCoalescingRule } from '../rules/ts/prefer-nullish-coalescing'
import { preferOptionalChainRule } from '../rules/ts/prefer-optional-chain'
import { typeAnnotationSpacingRule } from '../rules/ts/type-annotation-spacing'
import { typeGenericSpacingRule } from '../rules/ts/type-generic-spacing'
import { typeNamedTupleSpacingRule } from '../rules/ts/type-named-tuple-spacing'
import { codeOnly } from './utils'

export const tsPlugin: PickierPlugin = {
  name: 'ts',
  rules: {
    'no-require-imports': codeOnly(noRequireImportsRule),
    'no-top-level-await': codeOnly(noTopLevelAwaitRule),
    'no-ts-export-equal': codeOnly(noTsExportEqualRule),
    'no-explicit-any': codeOnly(noExplicitAnyRule),
    'prefer-nullish-coalescing': codeOnly(preferNullishCoalescingRule),
    'prefer-optional-chain': codeOnly(preferOptionalChainRule),
    'no-floating-promises': codeOnly(noFloatingPromisesRule),
    'no-misused-promises': codeOnly(noMisusedPromisesRule),
    'no-unsafe-assignment': codeOnly(noUnsafeAssignmentRule),
    'member-delimiter-style': codeOnly(memberDelimiterStyleRule),
    'type-annotation-spacing': codeOnly(typeAnnotationSpacingRule),
    'type-generic-spacing': codeOnly(typeGenericSpacingRule),
    'type-named-tuple-spacing': codeOnly(typeNamedTupleSpacingRule),
  },
}
