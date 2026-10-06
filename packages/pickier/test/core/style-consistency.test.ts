import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { scanContent } from '../../src/linter'

function cfg() {
  return {
    ...defaultConfig,
    verbose: false,
    pluginRules: {
      'style/consistent-chaining': 'warn',
      'style/consistent-list-newline': 'warn',
      'style/indent-unindent': 'warn',
    },
  } as any
}

describe('style.consistent-chaining', () => {
  it('reports mixed inline/newline chain', () => {
    const src = [
      'const x = obj',
      '  .foo() .bar()',
      '  .baz()',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/virtual/file.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-chaining')).toBe(true)
  })

  it('allows all-inline or all-newline', () => {
    const a = 'const x = obj.foo().bar().baz()\n'
    const b = 'const x = obj\n  .foo()\n  .bar()\n  .baz()\n'
    const ia = scanContent('/v/a.ts', a, cfg())
    const ib = scanContent('/v/b.ts', b, cfg())
    expect(ia.some(i => i.ruleId === 'style/consistent-chaining')).toBe(false)
    expect(ib.some(i => i.ruleId === 'style/consistent-chaining')).toBe(false)
  })

  it('handles optional chaining and comments', () => {
    const src = [
      'const y = obj?.foo() // call',
      '  .bar()?.baz()',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/v/chain-opt.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-chaining')).toBe(false)
  })

  it('flags when first call is inline but later line-break introduces mixed style', () => {
    const src = [
      'const z = obj.foo().bar()',
      '  .baz()',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/v/chain-mixed.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-chaining')).toBe(true)
  })
})

// Additional edge cases
describe('style.consistent-chaining (more cases)', () => {
  it('handles optional chaining and comments', () => {
    const src = [
      'const y = obj?.foo() // call',
      '  .bar()?.baz()',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/v/chain-opt.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-chaining')).toBe(false)
  })

  it('flags when first call is inline but later line-break introduces mixed style', () => {
    const src = [
      'const z = obj.foo().bar()',
      '  .baz()',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/v/chain-mixed.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-chaining')).toBe(true)
  })
})

describe('style.consistent-list-newline (more cases)', () => {
  it('ignores empty lists', () => {
    const obj = '{\n}\n'
    const arr = '[]\n'
    const i1 = scanContent('/v/empty-obj.ts', obj, cfg())
    const i2 = scanContent('/v/empty-arr.ts', arr, cfg())
    expect(i1.some(i => i.ruleId === 'style/consistent-list-newline')).toBe(false)
    expect(i2.some(i => i.ruleId === 'style/consistent-list-newline')).toBe(false)
  })

  it('handles trailing commas and comments between items', () => {
    const obj = [
      '{ a, /* c1 */ b,',
      '  // trailing',
      '  c,',
      '}\n',
    ].join('\n')
    const issues = scanContent('/v/obj-comments.ts', obj, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-list-newline')).toBe(true)
  })

  it('prefers single-line when only the last item is on a new line', () => {
    const src = '{ a, b,\n  c }\n'
    const issues = scanContent('/v/prefer-inline.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-list-newline' && /Should not have line breaks/.test(i.message))).toBe(true)
  })
})

describe('style.indent-unindent (more cases)', () => {
  it('handles nested template expressions across lines', () => {
    const src = [
      'const t = unindent`',
      '  line1 ${foo(',
      '    1, 2',
      '  )}',
      '`',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/v/t-nested.ts', src, cfg())
    // Properly indented should not report
    expect(issues.some(i => i.ruleId === 'style/indent-unindent')).toBe(false)
  })

  it('detects multiple tags in a block', () => {
    const src = [
      'const a = $`',
      'x',
      '`',
      'const b = unIndent`',
      'not indented',
      '`',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/v/t-multi.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/indent-unindent')).toBe(true)
  })
})

describe('style.consistent-list-newline', () => {
  it('requires newline per item when multi-line', () => {
    const src = '{\n  a,\n  b, c,\n  d\n}\n'
    const issues = scanContent('/v/obj.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-list-newline' && /Should have line breaks/.test(i.message))).toBe(true)
  })
  it('disallows newline when single-line expected', () => {
    const src = '{ a, b,\n c }\n'
    const issues = scanContent('/v/obj2.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/consistent-list-newline' && /Should not have line breaks/.test(i.message))).toBe(true)
  })
  it('works with arrays and named imports', () => {
    const arr = '[ 1,\n  2, 3 ]\n'
    const im = 'import { a,\n b } from \'x\'\n'
    const i1 = scanContent('/v/a.ts', arr, cfg())
    const i2 = scanContent('/v/i.ts', im, cfg())
    expect(i1.some(i => i.ruleId === 'style/consistent-list-newline')).toBe(true)
    expect(i2.some(i => i.ruleId === 'style/consistent-list-newline')).toBe(true)
  })
})

describe('style.indent-unindent', () => {
  it('reports incorrect inner indentation for unindent tags', () => {
    const src = [
      'const t = $`',
      'line1',
      '  line2',
      '`',
      ''.trim(),
    ].join('\n')
    const issues = scanContent('/v/t.ts', src, cfg())
    expect(issues.some(i => i.ruleId === 'style/indent-unindent')).toBe(true)
  })
})
