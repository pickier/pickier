/**
 * A `case`/`default:` label opens a body that carries no braces.
 *
 * The formatter tracks indentation by counting `{`, `[` and `(`, so it counted
 * no level for a case label and placed every statement of the body at the
 * label's own indentation:
 *
 *     switch (release) {
 *       case 'major':
 *       next.minor = 0          // belongs one level deeper
 *       break
 *
 * It did that to every switch it was ever run over, and it was not a report —
 * `--format` writes — so running the formatter rewrote correct source into
 * this shape. The linter's indent check accepts both forms, so nothing caught
 * it: stacksjs/bumpx's CI runs lint, typecheck, build and tests, and the
 * corruption rode through all four.
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

describe('switch-case indentation', () => {
  it('indents an unbraced case body one level past its label', () => {
    const out = fmt([
      'switch (release) {',
      'case \'major\':',
      'next.minor = 0',
      'break',
      '}',
      '',
    ].join('\n'))

    expect(out).toBe([
      'switch (release) {',
      '  case \'major\':',
      '    next.minor = 0',
      '    break',
      '}',
      '',
    ].join('\n'))
  })

  it('leaves an already-correct switch untouched', () => {
    // The real-world failure: running the formatter over correct source.
    const src = [
      'function bump(release: string): void {',
      '  switch (release) {',
      '    case \'major\':',
      '      next.major++',
      '      next.minor = 0',
      '      break',
      '    case \'minor\':',
      '      next.minor++',
      '      break',
      '    default:',
      '      throw new Error(\'bad\')',
      '  }',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('keeps stacked labels at the label level and shares one body', () => {
    const out = fmt([
      'switch (x) {',
      'case \'a\':',
      'case \'b\':',
      'doThing()',
      'break',
      '}',
      '',
    ].join('\n'))

    expect(out).toBe([
      'switch (x) {',
      '  case \'a\':',
      '  case \'b\':',
      '    doThing()',
      '    break',
      '}',
      '',
    ].join('\n'))
  })

  it('returns the switch\'s closing brace and following code to the outer level', () => {
    const out = fmt([
      'function f() {',
      'switch (x) {',
      'case 1:',
      'a()',
      'break',
      '}',
      'after()',
      '}',
      '',
    ].join('\n'))

    expect(out).toBe([
      'function f() {',
      '  switch (x) {',
      '    case 1:',
      '      a()',
      '      break',
      '  }',
      '  after()',
      '}',
      '',
    ].join('\n'))
  })

  it('does not double-indent a braced case body', () => {
    // `case x: {` already opens a block, so the brace tracker owns that level.
    const src = [
      'switch (x) {',
      '  case 1: {',
      '    const y = 1',
      '    break',
      '  }',
      '  case 2:',
      '    other()',
      '    break',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('indents a nested block inside a case body and recovers after it', () => {
    const src = [
      'switch (x) {',
      '  case 1:',
      '    if (ok) {',
      '      run()',
      '    }',
      '    break',
      '  case 2:',
      '    stop()',
      '    break',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('handles a switch nested inside a case body', () => {
    const src = [
      'switch (a) {',
      '  case 1:',
      '    switch (b) {',
      '      case 2:',
      '        deep()',
      '        break',
      '    }',
      '    break',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('does not treat an object property named default as a case label', () => {
    // `default` is a legal property name, and ESM interop uses it constantly.
    const src = [
      'const mod = {',
      '  default: handler,',
      '  other: 1,',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })

  it('does not mistake an identifier beginning with case for a label', () => {
    const src = [
      'const o = {',
      '  caseSensitive: true,',
      '}',
      '',
    ].join('\n')

    expect(fmt(src)).toBe(src)
  })
})
