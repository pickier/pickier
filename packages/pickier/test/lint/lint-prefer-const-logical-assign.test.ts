import { describe, expect, it } from 'bun:test'
import { preferConstRule as rule } from '../../src/rules/general/prefer-const'

/**
 * `prefer-const` decides whether a `let` is ever reassigned by matching the
 * name against a list of assignment operators. The list omitted the three
 * logical assignments — `??=`, `||=` and `&&=` — so the canonical lazy-init
 * shape read as never reassigned.
 *
 * That mattered more than a spurious warning: the rule is auto-fixable, so
 * `--fix` rewrote the declaration to `const` and the next call threw
 * "Assignment to constant variable". A linter that breaks working code on
 * --fix is worse than one that says nothing.
 */
function reports(source: string): boolean {
  return rule.check(source, { filePath: 'input.ts' } as never).length > 0
}

describe('prefer-const: logical assignment counts as reassignment', () => {
  it('leaves a ??= lazy initializer alone', () => {
    expect(reports('let cache: string | null = null\nexport function get() {\n  cache ??= build()\n  return cache\n}\n')).toBe(false)
  })

  it('leaves ||= alone', () => {
    expect(reports('let value: string | null = null\nexport function get() {\n  value ||= build()\n  return value\n}\n')).toBe(false)
  })

  it('leaves &&= alone', () => {
    expect(reports('let flag = 1\nexport function get() {\n  flag &&= 2\n  return flag\n}\n')).toBe(false)
  })
})

describe('prefer-const: operators that were already recognised', () => {
  it('still leaves plain assignment alone', () => {
    expect(reports('let value: string | null = null\nexport function get() {\n  value = build()\n  return value\n}\n')).toBe(false)
  })

  it('still leaves compound assignment alone', () => {
    expect(reports('let count = 1\nexport function bump() {\n  count += 1\n  return count\n}\n')).toBe(false)
  })

  it('still leaves increment alone', () => {
    expect(reports('let count = 1\nexport function bump() {\n  count++\n  return count\n}\n')).toBe(false)
  })
})

describe('prefer-const: a genuinely constant let is still reported', () => {
  it('reports a let that is only ever read', () => {
    // The rule has to keep doing its job — a fix that silences it everywhere
    // would pass the tests above and be useless.
    expect(reports('let value = 1\nexport function get() {\n  return value\n}\n')).toBe(true)
  })

  it('does not treat a mention inside a longer name as a reassignment', () => {
    expect(reports('let value = 1\nexport function get() {\n  let valueOther = 2\n  valueOther ??= 3\n  return value + valueOther\n}\n')).toBe(true)
  })
})
