import type { PickierPlugin } from '../types'

// Import general rules (error detection, possible problems)
import { arrayCallbackReturnRule } from '../rules/general/array-callback-return'
import { constructorSuperRule } from '../rules/general/constructor-super'
import { forDirectionRule } from '../rules/general/for-direction'
import { getterReturnRule } from '../rules/general/getter-return'
import { noAsyncPromiseExecutorRule } from '../rules/general/no-async-promise-executor'
import { noCompareNegZeroRule } from '../rules/general/no-compare-neg-zero'
import { noCondAssignRule } from '../rules/general/no-cond-assign'
import { noConstAssignRule } from '../rules/general/no-const-assign'
import { noConstantConditionRule } from '../rules/general/no-constant-condition'
import { noConstructorReturnRule } from '../rules/general/no-constructor-return'
import { noDupeClassMembersRule } from '../rules/general/no-dupe-class-members'
import { noDupeKeysRule } from '../rules/general/no-dupe-keys'
import { noDuplicateCaseRule } from '../rules/general/no-duplicate-case'
import { noEmptyPatternRule } from '../rules/general/no-empty-pattern'
import { noFallthroughRule } from '../rules/general/no-fallthrough'
import { noIrregularWhitespaceRule } from '../rules/general/no-irregular-whitespace'
import { noLossOfPrecisionRule } from '../rules/general/no-loss-of-precision'
import { noNew } from '../rules/general/no-new'
import { noPromiseExecutorReturnRule } from '../rules/general/no-promise-executor-return'
import { noRedeclareRule } from '../rules/general/no-redeclare'
import { noRegexSpaces } from '../rules/general/no-regex-spaces'
import { noSelfAssignRule } from '../rules/general/no-self-assign'
import { noSelfCompareRule } from '../rules/general/no-self-compare'
import { noSparseArraysRule } from '../rules/general/no-sparse-arrays'
import { noUndefRule } from '../rules/general/no-undef'
import { noUnreachableRule } from '../rules/general/no-unreachable'
import { noUnsafeNegationRule } from '../rules/general/no-unsafe-negation'
import { noUnusedVarsRule } from '../rules/general/no-unused-vars'
import { noUselessCatchRule } from '../rules/general/no-useless-catch'
import { preferConstRule } from '../rules/general/prefer-const'
import { preferObjectSpreadRule } from '../rules/general/prefer-object-spread'
import { preferTemplate } from '../rules/general/prefer-template'
import { useIsNaNRule } from '../rules/general/use-isnan'
import { validTypeofRule } from '../rules/general/valid-typeof'
import { codeOnly } from './utils'

export const generalPlugin: PickierPlugin = {
  name: 'general',
  rules: {
    // Error Detection / Possible Problems
    'array-callback-return': codeOnly(arrayCallbackReturnRule),
    'constructor-super': codeOnly(constructorSuperRule),
    'for-direction': codeOnly(forDirectionRule),
    'getter-return': codeOnly(getterReturnRule),
    'no-async-promise-executor': codeOnly(noAsyncPromiseExecutorRule),
    'no-compare-neg-zero': codeOnly(noCompareNegZeroRule),
    'no-cond-assign': codeOnly(noCondAssignRule),
    'no-const-assign': codeOnly(noConstAssignRule),
    'no-constant-condition': codeOnly(noConstantConditionRule),
    'no-constructor-return': codeOnly(noConstructorReturnRule),
    'no-dupe-class-members': codeOnly(noDupeClassMembersRule),
    'no-dupe-keys': codeOnly(noDupeKeysRule),
    'no-duplicate-case': codeOnly(noDuplicateCaseRule),
    'no-empty-pattern': codeOnly(noEmptyPatternRule),
    'no-fallthrough': codeOnly(noFallthroughRule),
    'no-irregular-whitespace': codeOnly(noIrregularWhitespaceRule),
    'no-loss-of-precision': codeOnly(noLossOfPrecisionRule),
    'no-new': codeOnly(noNew),
    'no-regex-spaces': codeOnly(noRegexSpaces),
    'no-promise-executor-return': codeOnly(noPromiseExecutorReturnRule),
    'no-redeclare': codeOnly(noRedeclareRule),
    'no-self-assign': codeOnly(noSelfAssignRule),
    'no-self-compare': codeOnly(noSelfCompareRule),
    'no-sparse-arrays': codeOnly(noSparseArraysRule),
    'no-undef': codeOnly(noUndefRule),
    'no-unsafe-negation': codeOnly(noUnsafeNegationRule),
    'no-unreachable': codeOnly(noUnreachableRule),
    'no-unused-vars': codeOnly(noUnusedVarsRule),
    'no-useless-catch': codeOnly(noUselessCatchRule),
    'prefer-const': codeOnly(preferConstRule),
    'prefer-object-spread': codeOnly(preferObjectSpreadRule),
    'prefer-template': codeOnly(preferTemplate),
    'use-isnan': codeOnly(useIsNaNRule),
    'valid-typeof': codeOnly(validTypeofRule),
  },
}
