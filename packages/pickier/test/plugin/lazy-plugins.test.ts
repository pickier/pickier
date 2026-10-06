import { describe, expect, it } from 'bun:test'
import { getAllPlugins } from '../../src/plugins'
import { getLazyPlugins } from '../../src/plugins/lazy'
import { LAZY_PLUGIN_RULES } from '../../src/plugins/manifest'

/**
 * The linter plans from getLazyPlugins(), where the non-code plugins are
 * stand-ins built from manifest.ts. If the manifest drifts from the real
 * plugins, rules would silently stop running or lose their fixers - so it is
 * checked against them here, in order.
 */
describe('lazy plugins', () => {
  const real = getAllPlugins()
  const lazy = getLazyPlugins()

  it('lists the same plugins in the same order', () => {
    expect(lazy.map(p => p.name)).toEqual(real.map(p => p.name))
  })

  for (const name of Object.keys(LAZY_PLUGIN_RULES)) {
    it(`manifest matches the ${name} plugin: rule names, order and fixers`, () => {
      const plugin = real.find(p => p.name === name)!
      const fromPlugin = Object.entries(plugin.rules).map(([rule, mod]): [string, boolean] => [rule, typeof mod.fix === 'function'])
      expect(Object.entries(LAZY_PLUGIN_RULES[name as keyof typeof LAZY_PLUGIN_RULES])).toEqual(fromPlugin)
    })
  }

  it('stand-ins have the same rules, fixers and results as the real ones', () => {
    for (const plugin of lazy) {
      const original = real.find(p => p.name === plugin.name)!
      expect(Object.keys(plugin.rules)).toEqual(Object.keys(original.rules))
      for (const [ruleName, rule] of Object.entries(plugin.rules))
        expect(typeof rule.fix).toBe(typeof original.rules[ruleName]!.fix)
    }
    const md = lazy.find(p => p.name === 'markdown')!
    const ctx = { filePath: 'doc.md', config: {} as any }
    const text = '#Heading\n\nSome text  \n'
    for (const ruleName of ['no-missing-space-atx', 'no-trailing-spaces']) {
      expect(md.rules[ruleName]!.check(text, ctx)).toEqual(real.find(p => p.name === 'markdown')!.rules[ruleName]!.check(text, ctx))
      expect(md.rules[ruleName]!.fix!(text, ctx)).toBe(real.find(p => p.name === 'markdown')!.rules[ruleName]!.fix!(text, ctx))
    }
  })
})
