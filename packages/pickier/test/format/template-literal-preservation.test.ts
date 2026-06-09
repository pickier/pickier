/**
 * Regression tests for issue #1361 — the formatter must preserve the contents
 * of multi-line template literals verbatim (cooked text AND ${...}
 * interpolations). Previously `${x}` was rewritten to `$ {x}` and the literal's
 * indentation/blank-lines were changed, turning valid code into non-compiling code.
 */
import type { PickierConfig } from '../../src/types'
import { describe, expect, it } from 'bun:test'
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

function fmt(src: string): string {
  return formatCode(src, cfg, 'test.ts')
}

describe('template literal preservation (#1361)', () => {
  it('does not insert a space inside ${...} interpolations', () => {
    const input = 'const title = \'x\'\nconst html = `\n  <h1>${title}</h1>\n  <pre>${title}</pre>\n`\n'
    const out = fmt(input)
    expect(out).not.toContain('$ {')
    expect(out).toBe(input)
  })

  it('preserves indentation inside a multi-line template', () => {
    const input = 'const t = `\n  two-space\n    four-space\n`\n'
    expect(fmt(input)).toBe(input)
  })

  it('preserves trailing whitespace inside a template', () => {
    const input = 'const t = `\n  keep these   \n`\nconst z = 1\n'
    expect(fmt(input)).toBe(input)
  })

  it('does not collapse blank lines inside a template', () => {
    const input = 'const t = `\na\n\n\n\nb\n`\nconst z = 1\n'
    expect(fmt(input)).toBe(input)
  })

  it('still formats real code outside templates', () => {
    const input = 'const x   =   1\nconst t = `\n  ${x}\n`\nconst y=2\n'
    const out = fmt(input)
    expect(out).toContain('const x = 1')
    expect(out).toContain('const y = 2')
    expect(out).toContain('  ${x}') // template content untouched
    expect(out).not.toContain('$ {')
  })

  it('leaves single-line templates intact', () => {
    const input = 'const a = `hi ${name} bye`\n'
    expect(fmt(input)).toBe(input)
  })

  it('handles interpolations containing braces', () => {
    const input = 'const a = `\n  ${cond ? `${x}` : \'n\'}\n  ${ {a: 1} }\n`\n'
    const out = fmt(input)
    expect(out).not.toContain('$ {')
    expect(out).toBe(input)
  })

  it('is idempotent', () => {
    const input = 'const html = `\n  <h1>${title}</h1>\n`\nconst y = 1\n'
    const once = fmt(input)
    expect(fmt(once)).toBe(once)
  })

  // The opening line begins in code but ends inside the template — its tail
  // (after the backtick) is string content and must survive verbatim too.
  it('preserves trailing whitespace on the opening backtick line', () => {
    const input = 'const t = `   \n  body\n`\nconst z = 1\n'
    expect(fmt(input)).toBe(input)
  })

  it('still normalizes the code prefix of the opening line', () => {
    const input = 'const   t   =   `   \n  body\n`\n'
    const out = fmt(input)
    expect(out).toBe('const t = `   \n  body\n`\n')
  })

  it('keeps the separating space before a returned template', () => {
    const input = 'function f() {\n  return `   \n  hi\n`\n}\n'
    expect(fmt(input)).toBe(input)
  })

  it('preserves an interpolation that opens on the first line', () => {
    const input = 'const t = `abc ${x}   \n  more\n`\n'
    const out = fmt(input)
    expect(out).not.toContain('$ {')
    expect(out).toBe(input)
  })

  // A nested template inside an interpolation, all on one line — maskStrings
  // used to match the nested template's opening backtick as the outer close,
  // exposing the inner ${...} to the spacing pass.
  it('preserves a nested template inside an interpolation (single line)', () => {
    const input = 'const k = `a${x ? `b${y}c` : z}d`\n'
    const out = fmt(input)
    expect(out).not.toContain('$ {')
    expect(out).toBe(input)
  })

  it('preserves a conditional nested template interpolation (real-world key)', () => {
    const input = 'const key = `S#${a}#${b}${r ? `#${r}` : d}`\n'
    const out = fmt(input)
    expect(out).not.toContain('$ {')
    expect(out).toBe(input)
  })
})
