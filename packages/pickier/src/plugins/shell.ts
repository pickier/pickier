import type { PickierPlugin } from '../types'
import { shellOnly } from './utils'

// Error prevention rules
import { commandSubstitutionRule } from '../rules/shell/command-substitution'
import { noCdWithoutCheckRule } from '../rules/shell/no-cd-without-check'
import { noEvalRule } from '../rules/shell/no-eval'
import { noExitInSubshellRule } from '../rules/shell/no-exit-in-subshell'
import { noLsParsingRule } from '../rules/shell/no-ls-parsing'
import { noUselessCatRule } from '../rules/shell/no-useless-cat'
import { noVariableInSingleQuotesRule } from '../rules/shell/no-variable-in-single-quotes'
import { quoteVariablesRule } from '../rules/shell/quote-variables'

// Style rules
import { functionStyleRule } from '../rules/shell/function-style'
import { indentRule } from '../rules/shell/indent'
import { keywordSpacingRule } from '../rules/shell/keyword-spacing'
import { noTrailingSemicolonsRule } from '../rules/shell/no-trailing-semicolons'
import { noTrailingWhitespaceRule } from '../rules/shell/no-trailing-whitespace'
import { operatorSpacingRule } from '../rules/shell/operator-spacing'
import { shebangRule } from '../rules/shell/shebang'

// Best practice rules
import { consistentCaseTerminatorsRule } from '../rules/shell/consistent-case-terminators'
import { heredocIndentRule } from '../rules/shell/heredoc-indent'
import { noBrokenRedirectRule } from '../rules/shell/no-broken-redirect'
import { preferDoubleBracketsRule } from '../rules/shell/prefer-double-brackets'
import { preferPrintfRule } from '../rules/shell/prefer-printf'
import { setOptionsRule } from '../rules/shell/set-options'

export const shellPlugin: PickierPlugin = {
  name: 'shell',
  rules: {
    // Error prevention
    'command-substitution': shellOnly(commandSubstitutionRule),
    'quote-variables': shellOnly(quoteVariablesRule),
    'no-cd-without-check': shellOnly(noCdWithoutCheckRule),
    'no-eval': shellOnly(noEvalRule),
    'no-useless-cat': shellOnly(noUselessCatRule),
    'no-ls-parsing': shellOnly(noLsParsingRule),
    'no-variable-in-single-quotes': shellOnly(noVariableInSingleQuotesRule),
    'no-exit-in-subshell': shellOnly(noExitInSubshellRule),

    // Style
    'shebang': shellOnly(shebangRule),
    'indent': shellOnly(indentRule),
    'function-style': shellOnly(functionStyleRule),
    'operator-spacing': shellOnly(operatorSpacingRule),
    'keyword-spacing': shellOnly(keywordSpacingRule),
    'no-trailing-semicolons': shellOnly(noTrailingSemicolonsRule),
    'no-trailing-whitespace': shellOnly(noTrailingWhitespaceRule),

    // Best practices
    'prefer-double-brackets': shellOnly(preferDoubleBracketsRule),
    'set-options': shellOnly(setOptionsRule),
    'prefer-printf': shellOnly(preferPrintfRule),
    'consistent-case-terminators': shellOnly(consistentCaseTerminatorsRule),
    'no-broken-redirect': shellOnly(noBrokenRedirectRule),
    'heredoc-indent': shellOnly(heredocIndentRule),
  },
}
