import { describe, expect, it } from 'bun:test'
import { spellPlugin } from '../../../src/plugins/spell'
import type { RuleContext } from '../../../src/types'
import { config as defaultConfig } from '../../../src/config'

const baseCtx: RuleContext = {
  filePath: 'test.ts',
  config: defaultConfig,
}

describe('spell plugin', () => {
  it('exports plugin with correct name', () => {
    expect(spellPlugin.name).toBe('spell')
  })

  it('has check rule', () => {
    expect(spellPlugin.rules['check']).toBeDefined()
    expect(typeof spellPlugin.rules['check'].check).toBe('function')
  })

  it('has check-comments rule', () => {
    expect(spellPlugin.rules['check-comments']).toBeDefined()
    expect(typeof spellPlugin.rules['check-comments'].check).toBe('function')
  })

  it('has check-markdown rule', () => {
    expect(spellPlugin.rules['check-markdown']).toBeDefined()
    expect(typeof spellPlugin.rules['check-markdown'].check).toBe('function')
  })

  it('check rule returns array (gracefully handles missing ts-spell-check)', () => {
    const issues = spellPlugin.rules['check'].check('hello world', baseCtx)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('check-comments rule returns array', () => {
    const issues = spellPlugin.rules['check-comments'].check('// hello world', baseCtx)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('check-markdown skips non-md files', () => {
    const issues = spellPlugin.rules['check-markdown'].check('# Hello', baseCtx)
    expect(issues).toEqual([])
  })

  it('check-markdown runs on .md files', () => {
    const mdCtx: RuleContext = { ...baseCtx, filePath: 'readme.md' }
    const issues = spellPlugin.rules['check-markdown'].check('# Hello', mdCtx)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('all rules have meta.docs', () => {
    for (const [name, rule] of Object.entries(spellPlugin.rules)) {
      expect(rule.meta?.docs).toBeDefined()
    }
  })

  it('spell rules are registered in default config as off', () => {
    const pluginRules = defaultConfig.pluginRules as Record<string, any>
    expect(pluginRules['spell/check']).toBe('off')
    expect(pluginRules['spell/check-comments']).toBe('off')
    expect(pluginRules['spell/check-markdown']).toBe('off')
  })
})
