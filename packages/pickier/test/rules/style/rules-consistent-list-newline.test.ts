import { describe, expect, it } from 'bun:test'
import { consistentListNewlineRule } from '../../../src/rules/style/consistent-list-newline'

const check = (text: string) => consistentListNewlineRule.check(text, { filePath: 'a.ts', config: {} as any })

describe('style/consistent-list-newline', () => {
  const lines = (text: string) => check(text).map(i => [i.line, i.message])
  const wrap = 'Should have line breaks between items'
  const inline = 'Should not have line breaks between items'

  it('accepts one item per line, and lists on one line', () => {
    expect(lines('const a = [\n  1,\n  2,\n]\n')).toEqual([])
    expect(lines('const b = { x: 1, y: [2, 3] }\n')).toEqual([])
    expect(lines('import {\n  a,\n  b,\n} from \'x\'\n')).toEqual([])
    expect(lines('const o = {\n  a: 1, // why\n  b: 2,\n}\n')).toEqual([])
  })

  it('takes the style from the first item', () => {
    expect(lines('const a = [\n  1, 2,\n  3,\n]\n')).toEqual([[2, wrap]])
    expect(lines('const a = [1, 2,\n  3]\n')).toEqual([[2, inline]])
    expect(lines('import { a, b,\n  c } from \'x\'\n')).toEqual([[2, inline]])
  })

  it('ignores line breaks inside an item', () => {
    expect(lines('const r = { rule: [\'error\', {\n  x: 1,\n}] }\n')).toEqual([])
    expect(lines('const n = [\n  { a: 1, b: 2 },\n  { c: 3 },\n]\n')).toEqual([])
    expect(lines('call(1, {\n  a: 1,\n})\n')).toEqual([])
  })

  it('does not read blocks, type arguments, comments or regexes as lists', () => {
    expect(lines('const f = () => {\n  const m = new Map<string, number>()\n  return m\n}\n')).toEqual([])
    expect(lines('function g(): void {\n  foo(a, b)\n  bar()\n}\n')).toEqual([])
    expect(lines('interface X { a: string; b: number }\n')).toEqual([])
    expect(lines('// { a,\n//   b }\nconst re = /[a,]/\nconst s = \'[1,\\n 2]\'\n')).toEqual([])
  })

  // It rebuilt a whole-file line map for every bracket and re-scanned each
  // list's prefix for every item, which took seconds on bundled code.
  it('stays linear on large inputs', () => {
    const oneLine = `const a = [${'{ a: [1, 2], b: { c: 3 } }, '.repeat(20_000)}]\n`
    const tall = `const b = [\n${'  { a: 1 },\n'.repeat(40_000)}]\n`
    const started = performance.now()
    expect(check(oneLine)).toEqual([])
    expect(check(tall)).toEqual([])
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
