import { describe, expect, it } from 'bun:test'
import { formatImports } from '../../../src/format'

/**
 * `import { D as E }` imports `D` and binds it as `E`. A specifier whose both
 * sides were a single letter had its direction flipped - the formatter wrote
 * `E as D`, which imports a different name and leaves the `E` the file uses
 * undefined - and flipped it back on the next run, so formatting never
 * reached a fixed point either.
 */
describe('aliased imports', () => {
  it('keeps the direction of a one-letter alias', () => {
    const src = 'import { D as E } from \'lib\'\n\nexport const v = E\n'
    expect(formatImports(src)).toBe(src)
  })

  it('keeps the direction of a one-letter type alias', () => {
    const src = 'import type { F as G } from \'lib\'\n\nexport const v: G | null = null\n'
    expect(formatImports(src)).toBe(src)
  })

  it('keeps the direction of a longer alias', () => {
    const src = 'import { Foo as Bar } from \'lib\'\n\nexport const v = Bar\n'
    expect(formatImports(src)).toBe(src)
  })

  it('binds the name the code uses', () => {
    const out = formatImports('import z, { B, type C, D as E, type F as G } from \'lib\'\n\nexport const v = [z, B, E] as Array<C | G>\n')
    expect(out).toContain('import type { C, F as G } from \'lib\'')
    expect(out).toContain('import z, { B, D as E } from \'lib\'')
    // and again, unchanged
    expect(formatImports(out)).toBe(out)
  })

  it('sorts specifiers by the name imported', () => {
    const out = formatImports('import { D as A, B } from \'lib\'\n\nexport const v = [A, B]\n')
    expect(out.split('\n')[0]).toBe('import { B, D as A } from \'lib\'')
  })
})
