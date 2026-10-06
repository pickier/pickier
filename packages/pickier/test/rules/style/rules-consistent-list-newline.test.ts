import { describe, expect, it } from 'bun:test'
import { consistentListNewlineRule } from '../../../src/rules/style/consistent-list-newline'

const check = (text: string) => consistentListNewlineRule.check(text, { filePath: 'a.ts', config: {} as any })

describe('style/consistent-list-newline', () => {
  it('accepts lists written on one line', () => {
    expect(check('const b = { x: 1, y: [2, 3] }\n')).toEqual([])
  })

  it('flags a list broken before its last item only', () => {
    const issues = check('const a = [1, 2,\n  3]\n')
    expect(issues.map(i => [i.line, i.column, i.message])).toEqual([[2, 1, 'Should not have line breaks between items']])
  })

  // It rebuilt a whole-file line map for every bracket and re-scanned each
  // list's prefix for every item, which took seconds on bundled code.
  it('stays linear on large inputs', () => {
    const oneLine = `const a = [${'{ a: [1, 2], b: { c: 3 } }, '.repeat(20_000)}]\n`
    const tall = `const b = [\n${'  { a: 1 },\n'.repeat(40_000)}]\n`
    const started = performance.now()
    expect(check(oneLine)).toEqual([])
    expect(check(tall).length).toBe(1)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
