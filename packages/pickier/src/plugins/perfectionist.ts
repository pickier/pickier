import type { PickierPlugin } from '../types'
import { sortImportsRule } from '../rules/sort/imports'
import { codeOnly } from './utils'

/**
 * Perfectionist plugin - provides compatibility with perfectionist ESLint plugin
 * These rules are aliases to existing Pickier rules under different namespaces
 */
export const perfectionistPlugin: PickierPlugin = {
  name: 'perfectionist',
  rules: {
    'sort-imports': codeOnly(sortImportsRule), // alias for pickier/sort-imports
  },
}
