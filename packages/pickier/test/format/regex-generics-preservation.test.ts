/**
 * Regression tests for #1369 — the formatter must never alter program
 * semantics inside regex literals, generic type arguments, unspaced arrow
 * functions, or block-comment prose.
 *
 * Background: spacing normalization ran on the raw line with only quoted
 * strings masked, so brace/comma rules rewrote regex bodies
 * (`/a{2,3}/` → `/a {2, 3}/`), the `<`/`>` operator rules split generic
 * type arguments (`Record<string, string>` → `Record < string, string>`),
 * and `(\S)>` matched the `>` of an unspaced arrow (`x=>y` → `x= > y`).
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

function fmt(src: string): string {
  return formatCode(src, cfg, 'test.ts')
}

describe('regex literal preservation (#1369)', () => {
  it('preserves quantifiers', () => {
    expect(fmt('const re = /a{2,3}/\n')).toBe('const re = /a{2,3}/\n')
    expect(fmt('const re = /\\d{4}/\n')).toBe('const re = /\\d{4}/\n')
    expect(fmt('const re = /\\w{1,}/g\n')).toBe('const re = /\\w{1,}/g\n')
  })

  it('preserves braces in character classes', () => {
    const escapeAll = 'const esc = s.replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\\\$&\')\n'
    expect(fmt(escapeAll)).toBe(escapeAll)
    expect(fmt('const re = /[{}]/g\n')).toBe('const re = /[{}]/g\n')
  })

  it('preserves escaped braces', () => {
    expect(fmt('const re = /\\{/\n')).toBe('const re = /\\{/\n')
    expect(fmt('const re = /\\{\\}/g\n')).toBe('const re = /\\{\\}/g\n')
  })

  it('preserves commas inside regex bodies', () => {
    expect(fmt('const re = /a,b,c/\n')).toBe('const re = /a,b,c/\n')
  })

  it('preserves regex after return / case / operators', () => {
    expect(fmt('return /x{2}/.test(s)\n')).toBe('return /x{2}/.test(s)\n')
    expect(fmt('const ok = b && /y{3}/.test(s)\n')).toBe('const ok = b && /y{3}/.test(s)\n')
  })

  it('still formats code around a regex', () => {
    const result = fmt('const x = [1,2].filter(n => /\\d{2}/.test(String(n)))\n')
    expect(result).toContain('[1, 2]')
    expect(result).toContain('/\\d{2}/')
  })

  it('does not mistake division for a regex', () => {
    expect(fmt('const half = total / 2\n')).toBe('const half = total / 2\n')
    expect(fmt('const r = (a + b) / (c + d)\n')).toBe('const r = (a + b) / (c + d)\n')
  })

  it('handles a slash inside a character class', () => {
    expect(fmt('const re = /[/]{1}/\n')).toBe('const re = /[/]{1}/\n')
  })

  it('never converts quotes inside regex literals', () => {
    const attrRegex = 'const attrRegex = /([\\w-]+)(?:=(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+)))?/g\n'
    expect(fmt(attrRegex)).toBe(attrRegex)
  })
})

describe('continuation line indentation (#1369)', () => {
  it('keeps method chains one level deeper', () => {
    const input = [
      'function esc(s: string): string {',
      '  return s',
      '    .replace(/&/g, \'&amp;\')',
      '    .replace(/</g, \'&lt;\')',
      '}',
      '',
    ].join('\n')
    expect(fmt(input)).toBe(input)
  })

  it('keeps ternary branches one level deeper', () => {
    const input = [
      'const merged = typeof options === \'string\'',
      '  ? getPreset(options)',
      '  : { ...DEFAULT_OPTIONS, ...options }',
      '',
    ].join('\n')
    expect(fmt(input)).toBe(input)
  })

  it('keeps brace-less control flow statements one level deeper', () => {
    const input = [
      'function f(ok: boolean): void {',
      '  if (!ok)',
      '    return',
      '',
      '  doWork()',
      '}',
      '',
    ].join('\n')
    expect(fmt(input)).toBe(input)
  })

  it('single-line if with statement is not treated as hanging', () => {
    const input = [
      'function g(opts: { a?: boolean, b?: boolean }): string[] {',
      '  const args: string[] = []',
      '  if (opts.a) args.push(\'--a\')',
      '  if (opts.b) args.push(\'--b\')',
      '  return args',
      '}',
      '',
    ].join('\n')
    expect(fmt(input)).toBe(input)
  })
})

describe('generic type argument preservation (#1369)', () => {
  it('preserves Record / Map / Promise type arguments', () => {
    expect(fmt('const params: Record<string, string> = {}\n')).toBe('const params: Record<string, string> = {}\n')
    expect(fmt('const m: Map<string, number> = new Map()\n')).toBe('const m: Map<string, number> = new Map()\n')
    expect(fmt('function f(): Promise<Response> { return fetch(u) }\n')).toContain('Promise<Response>')
  })

  it('preserves nested generics', () => {
    const input = 'type H = Record<string, (req: Request) => Promise<Response>>\n'
    expect(fmt(input)).toBe(input)
  })

  it('preserves explicit type arguments on calls', () => {
    expect(fmt('const s = useState<number>(0)\n')).toBe('const s = useState<number>(0)\n')
  })

  it('still spaces numeric comparisons', () => {
    expect(fmt('if (i<10) f()\n')).toContain('i < 10')
    expect(fmt('if (count>0) f()\n')).toContain('count > 0')
    expect(fmt('if ((a + b)>0) f()\n')).toContain('> 0')
  })

  it('leaves already-spaced comparisons alone', () => {
    expect(fmt('if (a < b) f()\n')).toContain('a < b')
    expect(fmt('if (a > b) f()\n')).toContain('a > b')
  })
})

describe('arrow function preservation (#1369)', () => {
  it('does not split unspaced arrows', () => {
    expect(fmt('const f = x=>x\n')).not.toContain('= >')
    expect(fmt('const g = (a: number)=>a\n')).not.toContain('= >')
  })
})

describe('compound assignment preservation (#1369)', () => {
  it('does not split arithmetic compound assignments', () => {
    expect(fmt('t /= d\n')).toBe('t /= d\n')
    expect(fmt('out += \'x\'\n')).toBe('out += \'x\'\n')
    expect(fmt('t -= 1\n')).toBe('t -= 1\n')
    expect(fmt('t *= 2\n')).toBe('t *= 2\n')
    expect(fmt('t %= 3\n')).toBe('t %= 3\n')
  })

  it('does not split logical compound assignments', () => {
    expect(fmt('a &&= b\n')).toBe('a &&= b\n')
    expect(fmt('a ||= b\n')).toBe('a ||= b\n')
    expect(fmt('a ??= b\n')).toBe('a ??= b\n')
  })

  it('still spaces plain assignment', () => {
    expect(fmt('const x=1\n')).toBe('const x = 1\n')
  })
})

describe('block comment prose preservation (#1369)', () => {
  it('does not rewrite ${...} examples inside JSDoc bodies', () => {
    const input = [
      '/**',
      ' * Example:',
      ' * <script>${getBridgeScript()}</script>',
      ' */',
      'export const x = 1',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('${getBridgeScript()}')
    expect(result).not.toContain('$ {')
  })

  it('does not mask quotes inside inline block comments', () => {
    const input = 'const a = 1 /* it\'s fine */ + 2\n'
    expect(fmt(input)).toContain('/* it\'s fine */')
  })

  it('preserves the conventional ` * ` JSDoc alignment', () => {
    const input = [
      '/**',
      ' * A function description',
      ' * @param x the value',
      ' */',
      'function test(x: number): number {',
      '  return x',
      '}',
      '',
    ].join('\n')
    expect(fmt(input)).toBe(input)
  })

  it('preserves nested JSDoc alignment', () => {
    const input = [
      'class MyClass {',
      '  /**',
      '   * A method description',
      '   */',
      '  method(): number {',
      '    return 1',
      '  }',
      '}',
      '',
    ].join('\n')
    expect(fmt(input)).toBe(input)
  })

  it('does not rewrite prose inside JSDoc bodies', () => {
    const input = [
      '/**',
      ' * Top-level JSDoc with a hyphen-ated word and a,b,c list',
      ' */',
      'export const x = 1',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('Top-level')
    expect(result).toContain('a,b,c')
  })

  it('does not treat backticks in JSDoc as template openers', () => {
    const input = [
      '/**',
      ' * Uses `foo()` internally',
      ' */',
      'const y = {a:1}',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('`foo()`')
    expect(result).toContain('const y = {a:1}')
  })

  it('block comment braces do not affect indentation tracking', () => {
    const input = [
      '/**',
      ' * Example: if (x) {',
      ' */',
      'const z = 1',
      '',
    ].join('\n')
    expect(fmt(input)).toContain('\nconst z = 1')
  })
})

describe('import organization preserves comments and multi-line imports (#1369)', () => {
  it('keeps a JSDoc that follows the import block', () => {
    const input = [
      'import process from \'node:process\'',
      '',
      '/**',
      ' * Doc for f',
      ' */',
      'export function f(): void {',
      '  if (process.env.X) { /* noop */ }',
      '}',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('/**\n * Doc for f\n */')
  })

  it('keeps line comments before, between, and after imports', () => {
    const input = [
      '// file header pragma',
      'import { a } from \'a\'',
      '// explains b',
      'import { b } from \'b\'',
      '',
      '// trailing helper comment',
      'export const x = a + b',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('// file header pragma')
    expect(result).toContain('// explains b')
    expect(result).toContain('// trailing helper comment')
    expect(result.startsWith('// file header pragma')).toBe(true)
  })

  it('handles multi-line imports without leaving broken syntax', () => {
    const input = [
      'import { a } from \'a\'',
      'import {',
      '  beta,',
      '  gamma,',
      '} from \'mod\'',
      '',
      'export const z = a + beta + gamma',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('beta')
    expect(result).toContain('gamma')
    expect(result).toContain('from \'mod\'')
    // no orphaned specifier lines
    expect(result).not.toMatch(/^\s*beta,\s*$/m)
  })

  it('is idempotent with comments around imports', () => {
    const input = [
      '// header',
      'import { a } from \'a\'',
      '',
      '/** doc */',
      'export const v = a',
      '',
    ].join('\n')
    const once = fmt(input)
    expect(fmt(once)).toBe(once)
  })
})
