import { defaultConfig } from '../../src/config'
import { describe, expect, it } from 'bun:test'
import { noUnusedVarsRule } from '../../src/rules/general/no-unused-vars'

const context = { filePath: 'mail-composable.ts', options: {}, config: defaultConfig }

describe('no-unused-vars retains the actual function body opening', () => {
  it('finds uses before nested object literals and callback blocks', () => {
    const sources = [
      'function update(key: string, values: object): void { items.map(item => item.key === key ? { ...item, ...values } : item) }',
      'async function selectedAction(action: string): Promise<void> { const item = selected(); if (item) await performBulk(action, [{ uid: item.uid }]) }',
      'function inspect(value: string): { result: string } { return { result: value } }',
    ]
    for (const source of sources) expect(noUnusedVarsRule.check(source, context)).toEqual([])
  })

  it('keeps regex slashes, quotes and braces inside character classes', () => {
    const source = String.raw`function validAddress(address: string): boolean {
      return address.length > 0 && !/[^\s<>"/\\,;:@{}]+/.test(address)
        && address.includes('@')
    }`
    expect(noUnusedVarsRule.check(source, context)).toEqual([])
  })

  it('still reports an unused parameter before a nested literal', () => {
    const issues = noUnusedVarsRule.check('function inspect(unused: string): void { consume({ value: 1 }) }', context)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("'unused'")
  })
})
