import type { LintIssue, PickierPlugin, RuleContext, RuleModule } from '../types'
import { arrayBracketSpacingRule } from '../rules/style/array-bracket-spacing'
import { arrowParensRule } from '../rules/style/arrow-parens'
import { arrowSpacingRule } from '../rules/style/arrow-spacing'
import { blockSpacingRule } from '../rules/style/block-spacing'
import { braceStyle } from '../rules/style/brace-style'
import { commaDangleRule } from '../rules/style/comma-dangle'
import { commaSpacingRule } from '../rules/style/comma-spacing'
import { commaStyleRule } from '../rules/style/comma-style'
import { computedPropertySpacingRule } from '../rules/style/computed-property-spacing'
import { consistentChainingRule } from '../rules/style/consistent-chaining'
import { consistentListNewlineRule } from '../rules/style/consistent-list-newline'
import { curlyRule } from '../rules/style/curly'
import { dotLocationRule } from '../rules/style/dot-location'
import { indentBinaryOpsRule } from '../rules/style/indent-binary-ops'
import { functionCallSpacingRule } from '../rules/style/function-call-spacing'
import { generatorStarSpacingRule } from '../rules/style/generator-star-spacing'
import { ifNewlineRule } from '../rules/style/if-newline'
import { indentUnindentRule } from '../rules/style/indent-unindent'
import { keySpacingRule } from '../rules/style/key-spacing'
import { keywordSpacingRule } from '../rules/style/keyword-spacing'
import { linesBetweenClassMembersRule } from '../rules/style/lines-between-class-members'
import { maxStatementsPerLineRule } from '../rules/style/max-statements-per-line'
import { multilineTernaryRule } from '../rules/style/multiline-ternary'
import { newParensRule } from '../rules/style/new-parens'
import { noExtraParensRule } from '../rules/style/no-extra-parens'
import { noWhitespaceBeforePropertyRule } from '../rules/style/no-whitespace-before-property'
import { noMixedOperatorsRule } from '../rules/style/no-mixed-operators'
import { noFloatingDecimalRule } from '../rules/style/no-floating-decimal'
import { noMixedSpacesAndTabsRule } from '../rules/style/no-mixed-spaces-and-tabs'
import { noMultiSpaces } from '../rules/style/no-multi-spaces'
import { noMultipleEmptyLines } from '../rules/style/no-multiple-empty-lines'
import { noTabsRule } from '../rules/style/no-tabs'
import { noTrailingSpaces } from '../rules/style/no-trailing-spaces'
import { objectCurlySpacingRule } from '../rules/style/object-curly-spacing'
import { operatorLinebreakRule } from '../rules/style/operator-linebreak'
import { paddedBlocksRule } from '../rules/style/padded-blocks'
import { quotePropsRule } from '../rules/style/quote-props'
import { restSpreadSpacingRule } from '../rules/style/rest-spread-spacing'
import { semiSpacingRule } from '../rules/style/semi-spacing'
import { spaceBeforeBlocksRule } from '../rules/style/space-before-blocks'
import { spaceBeforeFunctionParenRule } from '../rules/style/space-before-function-paren'
import { spaceInParensRule } from '../rules/style/space-in-parens'
import { spaceInfixOpsRule } from '../rules/style/space-infix-ops'
import { spaceUnaryOpsRule } from '../rules/style/space-unary-ops'
import { spacedCommentRule } from '../rules/style/spaced-comment'
import { switchColonSpacingRule } from '../rules/style/switch-colon-spacing'
import { templateCurlySpacingRule } from '../rules/style/template-curly-spacing'
import { templateTagSpacingRule } from '../rules/style/template-tag-spacing'
import { wrapIifeRule } from '../rules/style/wrap-iife'
import { yieldStarSpacingRule } from '../rules/style/yield-star-spacing'

const CODE_EXTS = /\.(ts|js|tsx|jsx|mts|mjs|cts|cjs)$/

// Wrap rules so they only run on code files (ts/js), not markdown, json, etc.
function codeOnly(rule: RuleModule): RuleModule {
  return {
    meta: rule.meta,
    check: (content: string, context: RuleContext): LintIssue[] => {
      if (!CODE_EXTS.test(context.filePath))
        return []
      return rule.check(content, context)
    },
    fix: rule.fix
      ? (content: string, context: RuleContext): string => {
          if (!CODE_EXTS.test(context.filePath))
            return content
          return rule.fix!(content, context)
        }
      : undefined,
  }
}

export const stylePlugin: PickierPlugin = {
  name: 'style',
  rules: {
    'brace-style': codeOnly(braceStyle),
    'curly': codeOnly(curlyRule),
    'max-statements-per-line': codeOnly(maxStatementsPerLineRule),
    'if-newline': codeOnly(ifNewlineRule),
    'consistent-chaining': codeOnly(consistentChainingRule),
    'consistent-list-newline': codeOnly(consistentListNewlineRule),
    'indent-unindent': codeOnly(indentUnindentRule),
    'no-multi-spaces': noMultiSpaces,
    'no-multiple-empty-lines': noMultipleEmptyLines,
    'no-trailing-spaces': noTrailingSpaces,
    // Spacing rules
    'keyword-spacing': codeOnly(keywordSpacingRule),
    'arrow-spacing': codeOnly(arrowSpacingRule),
    'space-infix-ops': codeOnly(spaceInfixOpsRule),
    'object-curly-spacing': codeOnly(objectCurlySpacingRule),
    'spaced-comment': codeOnly(spacedCommentRule),
    'block-spacing': codeOnly(blockSpacingRule),
    'space-before-blocks': codeOnly(spaceBeforeBlocksRule),
    'comma-spacing': codeOnly(commaSpacingRule),
    'semi-spacing': codeOnly(semiSpacingRule),
    'rest-spread-spacing': codeOnly(restSpreadSpacingRule),
    'generator-star-spacing': codeOnly(generatorStarSpacingRule),
    'yield-star-spacing': codeOnly(yieldStarSpacingRule),
    'function-call-spacing': codeOnly(functionCallSpacingRule),
    'template-tag-spacing': codeOnly(templateTagSpacingRule),
    'no-whitespace-before-property': codeOnly(noWhitespaceBeforePropertyRule),
    'key-spacing': codeOnly(keySpacingRule),
    'computed-property-spacing': codeOnly(computedPropertySpacingRule),
    'array-bracket-spacing': codeOnly(arrayBracketSpacingRule),
    'space-in-parens': codeOnly(spaceInParensRule),
    'template-curly-spacing': codeOnly(templateCurlySpacingRule),
    'space-unary-ops': codeOnly(spaceUnaryOpsRule),
    'switch-colon-spacing': codeOnly(switchColonSpacingRule),
    // Punctuation & parens rules
    'comma-dangle': codeOnly(commaDangleRule),
    'arrow-parens': codeOnly(arrowParensRule),
    'space-before-function-paren': codeOnly(spaceBeforeFunctionParenRule),
    'quote-props': codeOnly(quotePropsRule),
    'no-floating-decimal': codeOnly(noFloatingDecimalRule),
    'new-parens': codeOnly(newParensRule),
    'no-extra-parens': codeOnly(noExtraParensRule),
    'wrap-iife': codeOnly(wrapIifeRule),
    // Line break & block rules
    'comma-style': codeOnly(commaStyleRule),
    'dot-location': codeOnly(dotLocationRule),
    'operator-linebreak': codeOnly(operatorLinebreakRule),
    'multiline-ternary': codeOnly(multilineTernaryRule),
    'padded-blocks': codeOnly(paddedBlocksRule),
    'lines-between-class-members': codeOnly(linesBetweenClassMembersRule),
    // Expression rules
    'no-mixed-operators': codeOnly(noMixedOperatorsRule),
    'indent-binary-ops': codeOnly(indentBinaryOpsRule),
    // Whitespace & tabs rules
    'no-tabs': codeOnly(noTabsRule),
    'no-mixed-spaces-and-tabs': codeOnly(noMixedSpacesAndTabsRule),
  },
}
