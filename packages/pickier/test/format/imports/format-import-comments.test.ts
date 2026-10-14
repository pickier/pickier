import { describe, expect, it } from 'bun:test'
import { formatImports } from '../../../src/format'

/**
 * A comment between imports belongs to the import under it. Emitted after the
 * whole block instead, it described nothing any more - and left there it was
 * then read as a comment belonging to the code below, which moved it again on
 * the next run, so formatting was not idempotent.
 */
describe('comments in the import block', () => {
  it('keeps a comment above the import it describes', () => {
    const src = [
      'import type { P } from \'./types\'',
      '// the rules this plugin collects',
      'import { aRule } from \'./a\'',
      'import { bRule } from \'./b\'',
      '',
      'export const plugin = { rules: [aRule, bRule], p: null as P | null }',
      '',
    ].join('\n')
    const out = formatImports(src)
    const lines = out.split('\n')
    expect(lines[lines.indexOf('// the rules this plugin collects') + 1]).toBe('import { aRule } from \'./a\'')
    // and formatting it again changes nothing
    expect(formatImports(out)).toBe(out)
  })

  it('moves a comment with the import it describes', () => {
    const src = [
      'import { b } from \'./b\'',
      '// about a',
      'import { a } from \'./a\'',
      '',
      'export const v = a + b',
      '',
    ].join('\n')
    const out = formatImports(src)
    // './a' sorts first, and its comment travels up with it
    expect(out.split('\n').slice(0, 3)).toEqual([
      '// about a',
      'import { a } from \'./a\'',
      'import { b } from \'./b\'',
    ])
    expect(formatImports(out)).toBe(out)
  })

  it('hands the comment of a dropped import to the next one', () => {
    const src = [
      '// about the unused one',
      'import { unused } from \'./a\'',
      'import { b } from \'./b\'',
      '',
      'export const v = b',
      '',
    ].join('\n')
    const out = formatImports(src)
    expect(out).toContain('// about the unused one')
    expect(out).not.toContain('./a')
    expect(formatImports(out)).toBe(out)
  })

  it('keeps a comment whose import vanished with nothing after it', () => {
    const src = [
      'import { b } from \'./b\'',
      '// about the unused one',
      'import { unused } from \'./a\'',
      '',
      'export const v = b',
      '',
    ].join('\n')
    const out = formatImports(src)
    expect(out).toContain('// about the unused one')
    expect(formatImports(out)).toBe(out)
  })

  it('leaves a comment after the last import with the code', () => {
    const src = [
      'import { a } from \'./a\'',
      '',
      '/** what this does */',
      'export const v = a',
      '',
    ].join('\n')
    expect(formatImports(src)).toBe(src)
  })
})
