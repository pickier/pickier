import type { PickierPlugin } from '../types'
import { preferGlobalBuffer } from '../rules/node/prefer-global-buffer'
import { preferGlobalProcess } from '../rules/node/prefer-global-process'
import { codeOnly } from './utils'

export const nodePlugin: PickierPlugin = {
  name: 'node',
  rules: {
    'prefer-global/buffer': codeOnly(preferGlobalBuffer),
    'prefer-global/process': codeOnly(preferGlobalProcess),
  },
}
