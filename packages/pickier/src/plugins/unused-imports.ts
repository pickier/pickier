import type { PickierPlugin } from '../types'
import { noUnusedVarsRule } from '../rules/general/no-unused-vars'
import { codeOnly } from './utils'

/**
 * unused-imports plugin - provides compatibility with unused-imports ESLint plugin
 * These rules are aliases to existing Pickier rules under different namespaces
 */
export const unusedImportsPlugin: PickierPlugin = {
  name: 'unused-imports',
  rules: {
    'no-unused-vars': codeOnly(noUnusedVarsRule), // alias for general/no-unused-vars
    'no-unused-imports': codeOnly(noUnusedVarsRule), // alias for general/no-unused-vars (same detection)
  },
}
