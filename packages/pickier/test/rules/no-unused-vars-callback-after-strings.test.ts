import { defaultConfig } from '../../src/config'
import { describe, expect, it } from 'bun:test'
import { noUnusedVarsRule } from '../../src/rules/general/no-unused-vars'

const context = { filePath: 'craft-bridge.js', options: {}, config: defaultConfig }

/**
 * Strings and a regex before a `function (...)` on the same line used to be
 * cleaned to shorter text, so the rule found `function` in the cleaned line
 * and looked for its `(` in the real one from an earlier position. It landed
 * on the `.then(` and read the whole callback as the parameter list: every
 * word in the body was an "unused parameter", and `--fix` renamed used names
 * (craft's bridge: `r` → `_r`, `manifest` → `_manifest`, `o` → `_o`).
 */
describe('no-unused-vars reads a callback\'s own parameters after strings on its line', () => {
  it('finds the parameters of a callback that follows string arguments', () => {
    const source = [
      'export const prefs = {',
      '  get: function (key, fallback) {',
      '    return _req(\'prefs\', \'prefs:get\', _stringify({ k: key }), PREFS_TIMEOUT_MS).then(function (r) {',
      '      const tag = r && r.t',
      '      if (tag === \'none\') return fallback',
      '      return r.s',
      '    })',
      '  },',
      '',
      '  set: function (key, value) {',
      '    return save(key, value)',
      '  },',
      '}',
    ].join('\n')
    expect(noUnusedVarsRule.check(source, context)).toEqual([])
  })

  it('does the same after a regex literal', () => {
    const source = [
      'export function read(text) {',
      '  return text.replace(/\\s+/g, \' \').split(\',\').map(function (part) {',
      '    return part.trim()',
      '  })',
      '}',
    ].join('\n')
    expect(noUnusedVarsRule.check(source, context)).toEqual([])
  })

  it('leaves used names alone when fixing', () => {
    const source = [
      'export const audio = {',
      '  startRecording: function (path, opts) {',
      '    const o = Object.assign({ path: String(path) }, opts || {})',
      '    return _req(\'audio\', \'startRecording\', _stringify(o)).then(function (r) { return !!(r && r.ok) })',
      '  },',
      '  capabilities: function () {',
      '    return _req(\'capabilities\', \'capabilities:get\', \'{}\', 5000).then(function (manifest) {',
      '      window.__craftCapabilities = manifest',
      '      return manifest',
      '    })',
      '  },',
      '}',
    ].join('\n')
    expect(noUnusedVarsRule.fix!(source, context)).toBe(source)
  })

  it('still reports a callback parameter that really is unused', () => {
    const source = [
      'export function load() {',
      '  return fetchJson(\'/api\', \'GET\').then(function (unused) {',
      '    return 1',
      '  })',
      '}',
    ].join('\n')
    const issues = noUnusedVarsRule.check(source, context)
    expect(issues.map(issue => issue.message.match(/^'([^']+)'/)?.[1])).toEqual(['unused'])
  })
})
