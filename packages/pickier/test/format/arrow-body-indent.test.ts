/**
 * A line that ends at its arrow leaves the body for the line below.
 *
 * Indentation is tracked by counting `{`, `[` and `(` at a line's end, so a
 * line ending at `=>` counted no level and the body snapped back to the
 * arrow's own indentation:
 *
 *     items.find(
 *       item =>
 *       item.endsWith('x')        // belongs one level deeper
 *     )
 *
 * Same family as the `case` label fix beside this file, and as the brace-less
 * `if` of pickier#1369: a body with no braces around it is invisible to a
 * brace tracker. `--format` writes, so the formatter rewrote correct source.
 *
 * NOT covered here, because it is a different defect: a delimiter opened in
 * the MIDDLE of a line is still not tracked, since only the last character is
 * examined. So the continuation inside `&& (a === b` keeps the level of the
 * `&&` rather than gaining one for the open paren. Fixing that means counting
 * net delimiters per line, which is an indent-engine change, not this one.
 */
import { describe, expect, it } from 'bun:test'
import type { PickierConfig } from '../../src/types'
import { formatCode } from '../../src/format'

const cfg: PickierConfig = {
  verbose: false,
  ignores: [],
  lint: { extensions: ['ts'], reporter: 'stylish', cache: false, maxWarnings: -1 },
  format: {
    extensions: ['ts'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one',
    indent: 2,
    indentStyle: 'spaces',
    quotes: 'single',
    semi: false,
  },
  rules: { noDebugger: 'error', noConsole: 'warn' },
  pluginRules: {},
}

const fmt = (src: string): string => formatCode(src, cfg, 'test.ts')

describe('arrow body indentation', () => {
  it('hangs the body of a line that ends at its arrow', () => {
    const out = fmt([
      'const first = items.find(',
      'item =>',
      'item.ok,',
      ')',
      '',
    ].join('\n'))

    expect(out).toBe([
      'const first = items.find(',
      '  item =>',
      '    item.ok,',
      ')',
      '',
    ].join('\n'))
  })

  it('leaves an already-correct arrow body untouched', () => {
    const src = [
      'function pick(items: string[]): string | undefined {',
      '  return items.find(',
      '    item =>',
      '      item.endsWith(\'package.json\'),',
      '  )',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('accumulates a level per curried arrow', () => {
    const src = [
      'const curried = a =>',
      '  b =>',
      '    a + b',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('gives the level back after the hanging body ends', () => {
    const src = [
      'const fn = x =>',
      '  x + 1',
      'const after = 2',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('does not double-indent a braced arrow body', () => {
    // `x => {` already opens a block, so the brace tracker owns that level.
    const src = [
      'const fn = (x: number) => {',
      '  return x + 1',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('still hangs when a trailing comment follows the arrow', () => {
    const src = [
      'const fn = x => // keep',
      '  x + 1',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('does not hang on an arrow that is only string content', () => {
    const src = [
      'const label = \'maps a => b\'',
      'const after = 1',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('hangs an arrow body inside an object literal', () => {
    const src = [
      'const handlers = {',
      '  onSave: value =>',
      '    persist(value),',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('hangs a multi-line arrow type', () => {
    const src = [
      'type Mapper = (input: string) =>',
      '  string',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })
})
