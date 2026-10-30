import type { PickierConfig } from '../../src/types'
import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/config'
import { fixText, lintText, runLint } from '../../src/index'

/**
 * Regression tests for #1394: a disable directive was honoured when pickier
 * reported and ignored when pickier fixed, so `lint --fix` rewrote lines the
 * reporter had just agreed to leave alone - in the reported case, the
 * contents of a string literal passed to `.replace()`.
 *
 * The gate lives in the fixer driver (`applyPluginFixes`), not in the rules,
 * so each case asserts BOTH halves: not reported, and not rewritten.
 */

function cfgWith(rules: Record<string, 'error' | 'warning' | 'off'>): PickierConfig {
  return { ...defaultConfig, pluginRules: { ...defaultConfig.pluginRules, ...rules } as PickierConfig['pluginRules'] }
}

const tailwind = cfgWith({ 'pickier/sort-tailwind-classes': 'error' })

async function reportsRule(src: string, cfg: PickierConfig, file: string, ruleId: string): Promise<boolean> {
  return (await lintText(src, cfg, file)).some(i => (i.ruleId as string).includes(ruleId))
}

describe('--fix honours disable directives (#1394)', () => {
  it('leaves a string literal alone on a disabled line', async () => {
    const src = [
      '// Custom SVG palette classes, rather than utility classes.',
      '// eslint-disable-next-line pickier/sort-tailwind-classes',
      'export const mat = staticProp(prop).replace(\'class="kit"\', \'class="kit exercise-art-mat"\')',
      '',
    ].join('\n')

    expect(await reportsRule(src, tailwind, 'a.ts', 'sort-tailwind-classes')).toBe(false)
    expect(fixText(src, tailwind, 'a.ts')).toBe(src)
  })

  it('still sorts the same line without the directive', () => {
    const src = 'export const mat = staticProp(prop).replace(\'class="kit"\', \'class="kit exercise-art-mat"\')\n'
    expect(fixText(src, tailwind, 'a.ts')).toContain('class="exercise-art-mat kit"')
  })

  it('accepts the bare rule name as well as the plugin-qualified id', () => {
    const src = [
      '// eslint-disable-next-line sort-tailwind-classes',
      'export const mat = cls(\'class="kit exercise-art-mat"\')',
      '',
    ].join('\n')
    expect(fixText(src, tailwind, 'a.ts')).toBe(src)
  })

  it('accepts a pickier- directive as well as an eslint- one', () => {
    const src = [
      '// pickier-disable-next-line pickier/sort-tailwind-classes',
      'export const mat = cls(\'class="kit exercise-art-mat"\')',
      '',
    ].join('\n')
    expect(fixText(src, tailwind, 'a.ts')).toBe(src)
  })

  it('honours a disable/enable block', async () => {
    const src = [
      'export const z = 1',
      '/* eslint-disable pickier/sort-tailwind-classes */',
      'export const a = cls(\'class="kit exercise-art-mat"\')',
      '/* eslint-enable pickier/sort-tailwind-classes */',
      '',
    ].join('\n')
    expect(await reportsRule(src, tailwind, 'a.ts', 'sort-tailwind-classes')).toBe(false)
    expect(fixText(src, tailwind, 'a.ts')).toBe(src)
  })

  it('fixes again after the block re-enables the rule', () => {
    const src = [
      'export const z = 1',
      '/* eslint-disable pickier/sort-tailwind-classes */',
      'export const a = cls(\'class="kit exercise-art-mat"\')',
      '/* eslint-enable pickier/sort-tailwind-classes */',
      'export const b = cls(\'class="kit exercise-art-mat"\')',
      '',
    ].join('\n')
    const out = fixText(src, tailwind, 'a.ts').split('\n')
    expect(out[2]).toContain('class="kit exercise-art-mat"')
    expect(out[4]).toContain('class="exercise-art-mat kit"')
  })

  // `parseDisableDirectives` reads a block disable on line 1 as covering the
  // whole file, enable or no enable, and the reporter suppresses accordingly.
  // The point of this fix is that the two agree, so the fixer follows it.
  it('treats a block disable on line 1 the way the reporter does', async () => {
    const src = [
      '/* eslint-disable pickier/sort-tailwind-classes */',
      'export const a = cls(\'class="kit exercise-art-mat"\')',
      '/* eslint-enable pickier/sort-tailwind-classes */',
      'export const b = cls(\'class="kit exercise-art-mat"\')',
      '',
    ].join('\n')
    expect(await reportsRule(src, tailwind, 'a.ts', 'sort-tailwind-classes')).toBe(false)
    expect(fixText(src, tailwind, 'a.ts')).toBe(src)
  })

  it('leaves the rest of the file fixable', () => {
    const src = [
      '// eslint-disable-next-line pickier/sort-tailwind-classes',
      'export const a = cls(\'class="kit exercise-art-mat"\')',
      'export const b = cls(\'class="kit exercise-art-mat"\')',
      '',
    ].join('\n')
    const out = fixText(src, tailwind, 'a.ts').split('\n')
    expect(out[1]).toContain('class="kit exercise-art-mat"')
    expect(out[2]).toContain('class="exercise-art-mat kit"')
  })

  it('does not let one rule\'s directive hold off another rule', () => {
    const cfg = cfgWith({ 'pickier/sort-tailwind-classes': 'error', 'quality/no-var': 'error' })
    const src = [
      '// eslint-disable-next-line pickier/sort-tailwind-classes',
      'export const a = cls(\'class="kit exercise-art-mat"\')',
      'export function f() { var y = 1; return y }',
      '',
    ].join('\n')
    const out = fixText(src, cfg, 'a.ts')
    expect(out.split('\n')[1]).toContain('class="kit exercise-art-mat"')
    expect(out).not.toContain('var y')
  })

  // A fixer that moves lines rather than editing them in place cannot have
  // one line reinstated under it: `./a` would be back on its old line and
  // also on the line it sorted to, and `./b` would be gone. Such a fix is
  // dropped whole instead.
  for (const rule of ['pickier/sort-imports', 'perfectionist/sort-imports']) {
    it(`drops a reorder rather than duplicate a line (${rule})`, () => {
      const cfg = cfgWith({ [rule]: 'error' })
      const src = [
        'import { b } from \'./b\'',
        `// eslint-disable-next-line ${rule}`,
        'import { a } from \'./a\'',
        '',
        'export const v = a + b',
        '',
      ].join('\n')

      const out = fixText(src, cfg, 'a.ts')
      expect(out).toBe(src)
      expect(out.match(/\.\/a/g)).toHaveLength(1)
      expect(out).toContain('./b')
    })
  }

  it('still sorts those imports without the directive', () => {
    const cfg = cfgWith({ 'pickier/sort-imports': 'error' })
    const src = 'import { b } from \'./b\'\nimport { a } from \'./a\'\n\nexport const v = a + b\n'
    expect(fixText(src, cfg, 'a.ts').split('\n').slice(0, 2)).toEqual([
      'import { a } from \'./a\'',
      'import { b } from \'./b\'',
    ])
  })

  // `general/prefer-const` scans for its own `disable-next-line` comments
  // and knows nothing of the block form, so its fixer rewrote a block the
  // reporter was staying out of. Gating in the driver covers every rule's
  // fixer, including the two that roll their own.
  it('covers a rule whose fixer only knows the next-line form', async () => {
    const cfg = cfgWith({ 'general/prefer-const': 'error' })
    const src = [
      'export function g() {',
      '  /* eslint-disable general/prefer-const */',
      '  let y = 2',
      '  /* eslint-enable general/prefer-const */',
      '  return y',
      '}',
      '',
    ].join('\n')

    expect(await reportsRule(src, cfg, 'a.ts', 'prefer-const')).toBe(false)
    expect(fixText(src, cfg, 'a.ts')).toBe(src)
  })

  it('still rewrites that declaration without the block', () => {
    const cfg = cfgWith({ 'general/prefer-const': 'error' })
    const src = 'export function g() {\n  let y = 2\n  return y\n}\n'
    expect(fixText(src, cfg, 'a.ts')).toContain('const y = 2')
  })

  it('reports and rewrites the same lines end to end', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pickier-fix-directives-'))
    const file = join(dir, 'a.ts')
    const src = [
      '// eslint-disable-next-line pickier/sort-tailwind-classes',
      'export const a = cls(\'class="kit exercise-art-mat"\')',
      '',
    ].join('\n')
    writeFileSync(file, src, 'utf8')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })
})
