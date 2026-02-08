import type { PickierPlugin } from '../types'

// Import Best Practices rules
import { complexityRule } from '../rules/quality/complexity'
import { defaultCaseRule } from '../rules/quality/default-case'
import { eqeqeqRule } from '../rules/quality/eqeqeq'
import { maxDepthRule } from '../rules/quality/max-depth'
import { maxLinesPerFunctionRule } from '../rules/quality/max-lines-per-function'
import { noAlertRule } from '../rules/quality/no-alert'
import { noAwaitInLoopRule } from '../rules/quality/no-await-in-loop'
import { noCallerRule } from '../rules/quality/no-caller'
import { noCaseDeclarationsRule } from '../rules/quality/no-case-declarations'
import { noElseReturnRule } from '../rules/quality/no-else-return'
import { noEmptyRule } from '../rules/quality/no-empty'
import { noEmptyFunctionRule } from '../rules/quality/no-empty-function'
import { noEvalRule } from '../rules/quality/no-eval'
import { noExtendNativeRule } from '../rules/quality/no-extend-native'
import { noExtraBooleanCastRule } from '../rules/quality/no-extra-boolean-cast'
import { noGlobalAssignRule } from '../rules/quality/no-global-assign'
import { noImpliedEvalRule } from '../rules/quality/no-implied-eval'
import { noIteratorRule } from '../rules/quality/no-iterator'
import { noLonelyIfRule } from '../rules/quality/no-lonely-if'
import { noNewRule } from '../rules/quality/no-new'
import { noNewFuncRule } from '../rules/quality/no-new-func'
import { noNewWrappersRule } from '../rules/quality/no-new-wrappers'
import { noOctalRule } from '../rules/quality/no-octal'
import { noParamReassignRule } from '../rules/quality/no-param-reassign'
import { noProtoRule } from '../rules/quality/no-proto'
import { noReturnAssignRule } from '../rules/quality/no-return-assign'
import { noSequencesRule } from '../rules/quality/no-sequences'
import { noShadowRule } from '../rules/quality/no-shadow'
import { noThrowLiteralRule } from '../rules/quality/no-throw-literal'
import { noUseBeforeDefineRule } from '../rules/quality/no-use-before-define'
import { noUselessCallRule } from '../rules/quality/no-useless-call'
import { noUselessConcatRule } from '../rules/quality/no-useless-concat'
import { noUselessEscapeRule } from '../rules/quality/no-useless-escape'
import { noUselessRenameRule } from '../rules/quality/no-useless-rename'
import { noUselessReturnRule } from '../rules/quality/no-useless-return'
import { noVarRule } from '../rules/quality/no-var'
import { noWithRule } from '../rules/quality/no-with'
import { preferArrowCallbackRule } from '../rules/quality/prefer-arrow-callback'
import { requireAwaitRule } from '../rules/quality/require-await'
import { codeOnly } from './utils'

export const qualityPlugin: PickierPlugin = {
  name: 'quality',
  rules: {
    // Best Practices
    'default-case': codeOnly(defaultCaseRule),
    'eqeqeq': codeOnly(eqeqeqRule),
    'no-alert': codeOnly(noAlertRule),
    'no-await-in-loop': codeOnly(noAwaitInLoopRule),
    'no-caller': codeOnly(noCallerRule),
    'no-case-declarations': codeOnly(noCaseDeclarationsRule),
    'no-else-return': codeOnly(noElseReturnRule),
    'no-empty': codeOnly(noEmptyRule),
    'no-empty-function': codeOnly(noEmptyFunctionRule),
    'no-eval': codeOnly(noEvalRule),
    'no-extend-native': codeOnly(noExtendNativeRule),
    'no-global-assign': codeOnly(noGlobalAssignRule),
    'no-implied-eval': codeOnly(noImpliedEvalRule),
    'no-iterator': codeOnly(noIteratorRule),
    'no-new': codeOnly(noNewRule),
    'no-new-func': codeOnly(noNewFuncRule),
    'no-new-wrappers': codeOnly(noNewWrappersRule),
    'no-octal': codeOnly(noOctalRule),
    'no-param-reassign': codeOnly(noParamReassignRule),
    'no-proto': codeOnly(noProtoRule),
    'no-return-assign': codeOnly(noReturnAssignRule),
    'no-shadow': codeOnly(noShadowRule),
    'no-throw-literal': codeOnly(noThrowLiteralRule),
    'no-use-before-define': codeOnly(noUseBeforeDefineRule),
    'no-useless-call': codeOnly(noUselessCallRule),
    'no-with': codeOnly(noWithRule),
    'require-await': codeOnly(requireAwaitRule),

    // Code Quality & Complexity
    'complexity': codeOnly(complexityRule),
    'max-depth': codeOnly(maxDepthRule),
    'max-lines-per-function': codeOnly(maxLinesPerFunctionRule),
    'no-extra-boolean-cast': codeOnly(noExtraBooleanCastRule),
    'no-lonely-if': codeOnly(noLonelyIfRule),
    'no-sequences': codeOnly(noSequencesRule),
    'no-useless-concat': codeOnly(noUselessConcatRule),
    'no-useless-escape': codeOnly(noUselessEscapeRule),
    'no-useless-rename': codeOnly(noUselessRenameRule),
    'no-useless-return': codeOnly(noUselessReturnRule),
    'no-var': codeOnly(noVarRule),
    'prefer-arrow-callback': codeOnly(preferArrowCallbackRule),
  },
}
