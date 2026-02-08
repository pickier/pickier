import type { PickierPlugin } from '../types'
import { noSuperLinearBacktrackingRule } from '../rules/regexp/no-super-linear-backtracking'
import { noUnusedCapturingGroupRule } from '../rules/regexp/no-unused-capturing-group'
import { noUselessLazy } from '../rules/regexp/no-useless-lazy'
import { codeOnly } from './utils'

export const regexpPlugin: PickierPlugin = {
  name: 'regexp',
  rules: {
    'no-super-linear-backtracking': codeOnly(noSuperLinearBacktrackingRule),
    'no-unused-capturing-group': codeOnly(noUnusedCapturingGroupRule),
    'no-useless-lazy': codeOnly(noUselessLazy),
  },
}
