import { describe, expect, it } from 'bun:test'
import { preferConstRule as rule } from '../../src/rules/general/prefer-const'

/**
 * A function or method written ABOVE a `let` runs after it, and may reassign
 * it. The rule only searched the text after the declaration, so this read as
 * never reassigned:
 *
 *   class Cache { invalidate() { generation++ } }
 *   let generation = 0
 *
 * and `--fix` rewrote it to `const`, which throws "Assignment to constant
 * variable" on the first call. Found in stacks' RBAC cache.
 */
function reports(source: string): boolean {
  return rule.check(source, { filePath: 'input.ts' } as never).length > 0
}

function fix(source: string): string {
  return rule.fix!(source, { filePath: 'input.ts' } as never) as string
}

describe('prefer-const: reassignment written before the declaration', () => {
  const source = 'export class Cache {\n  invalidate(): void {\n    generation++\n  }\n}\n\nlet generation = 0\n\nexport function read(): number {\n  return generation\n}\n'

  it('is not reported', () => {
    expect(reports(source)).toBe(false)
  })

  it('is not rewritten by --fix', () => {
    expect(fix(source)).toBe(source)
  })

  it('also covers plain assignment in an earlier function', () => {
    expect(reports('export function reset(): void {\n  state = 0\n}\nlet state = 1\n')).toBe(false)
  })

  it('still reports a let nothing reassigns, before or after', () => {
    expect(reports('export function read(): number {\n  return total\n}\nlet total = 1\n')).toBe(true)
  })
})
