import type { PickierConfig, PickierPlugin, RuleModule } from '../../src/types'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { lintText } from '../../src/linter'

const budget = 200
let previousBudget: string | undefined

beforeEach(() => {
  previousBudget = process.env.PICKIER_RULE_TIMEOUT_MS
  process.env.PICKIER_RULE_TIMEOUT_MS = String(budget)
})

afterEach(() => {
  if (previousBudget === undefined)
    delete process.env.PICKIER_RULE_TIMEOUT_MS
  else
    process.env.PICKIER_RULE_TIMEOUT_MS = previousBudget
})

function configuration(check: RuleModule['check']): PickierConfig {
  const plugin: PickierPlugin = { name: 'timing', rules: { probe: { check } } }
  return { ...defaultConfig, plugins: [plugin], pluginRules: { 'timing/probe': 'error' } }
}

describe('plugin rule execution budget', () => {
  test('does not charge another file’s synchronous work to a fast rule', async () => {
    const config = configuration((content) => {
      if (content.includes('slow'))
        Bun.sleepSync(budget + 100)
      return []
    })
    const [fast, slow] = await Promise.all([
      lintText('const fast = 1\n', config, 'fast.ts'),
      lintText('const slow = 1\n', config, 'slow.ts'),
    ])

    expect(fast.filter(issue => issue.ruleId === 'timing/probe-internal')).toEqual([])
    expect(slow.filter(issue => issue.ruleId === 'timing/probe-internal')).toMatchObject([
      { severity: 'error', message: expect.stringContaining('exceeded timeout budget') },
    ])
  })

  test('still rejects asynchronous rules that never settle', async () => {
    // JavaScript plugins can return a promise even though the typed contract is synchronous.
    const check = (() => new Promise(() => {})) as unknown as RuleModule['check']
    const issues = await lintText('const pending = 1\n', configuration(check), 'pending.ts')

    expect(issues.filter(issue => issue.ruleId === 'timing/probe-internal')).toMatchObject([
      { severity: 'error', message: expect.stringContaining('Timeout after') },
    ])
  })

  test('still reports a synchronous exception from the rule', async () => {
    const issues = await lintText('const throws = 1\n', configuration(() => {
      throw new Error('probe failure')
    }), 'throws.ts')

    expect(issues.filter(issue => issue.ruleId === 'timing/probe-internal')).toMatchObject([
      { severity: 'error', message: 'Rule threw: probe failure' },
    ])
  })

  test('still catches asynchronous work that blocks its timeout callback', async () => {
    const check = (async () => {
      await Promise.resolve()
      Bun.sleepSync(budget + 100)
      return []
    }) as unknown as RuleModule['check']
    const issues = await lintText('const blocks = 1\n', configuration(check), 'blocks.ts')

    expect(issues.filter(issue => issue.ruleId === 'timing/probe-internal')).toMatchObject([
      { severity: 'error', message: expect.stringContaining('exceeded timeout budget') },
    ])
  })
})
