import type { RuleContext } from '../../../src/types'
import { describe, expect, it } from 'bun:test'
import { preferGlobalBuffer } from '../../../src/rules/node/prefer-global-buffer'
import { preferGlobalProcess } from '../../../src/rules/node/prefer-global-process'

const ctx: RuleContext = { filePath: 'a.ts', config: {} as any }

describe('node/prefer-global/buffer', () => {
  it('flags importing Buffer from the buffer module', () => {
    expect(preferGlobalBuffer.check('import { Buffer } from \'buffer\'\n', ctx)).toHaveLength(1)
    expect(preferGlobalBuffer.check('import { Buffer } from \'node:buffer\'\n', ctx)).toHaveLength(1)
    expect(preferGlobalBuffer.check('const { Buffer } = require(\'buffer\')\n', ctx)).toHaveLength(1)
  })

  it('does not flag using the global Buffer directly', () => {
    expect(preferGlobalBuffer.check('const b = Buffer.from(\'x\')\n', ctx)).toHaveLength(0)
  })

  it('does not flag an unrelated import from the buffer module', () => {
    expect(preferGlobalBuffer.check('import { constants } from \'buffer\'\n', ctx)).toHaveLength(0)
  })
})

describe('node/prefer-global/process', () => {
  it('flags requiring/importing the process module', () => {
    expect(preferGlobalProcess.check('import process from \'process\'\n', ctx)).toHaveLength(1)
    expect(preferGlobalProcess.check('import process from \'node:process\'\n', ctx)).toHaveLength(1)
    expect(preferGlobalProcess.check('const process = require(\'process\')\n', ctx)).toHaveLength(1)
  })

  it('does not flag using the global process directly', () => {
    expect(preferGlobalProcess.check('process.exit(0)\n', ctx)).toHaveLength(0)
  })
})
