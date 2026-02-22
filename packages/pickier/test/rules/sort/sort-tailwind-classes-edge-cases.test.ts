import { describe, expect, test } from 'bun:test'
import type { RuleContext } from '../../../src/types'
import { sortTailwindClassesRule } from '../../../src/rules/sort/tailwind-classes'

const ctx: RuleContext = { filePath: '/test/file.tsx', config: {} as any }

function check(content: string) {
  return sortTailwindClassesRule.check(content, ctx)
}

function fix(content: string) {
  return sortTailwindClassesRule.fix!(content, ctx)
}

function classes(result: string): string {
  return result.match(/"([^"]+)"/)?.[1] ?? result
}

// ---------------------------------------------------------------------------
// Arbitrary values: w-[100px], bg-[#ff0000], p-[calc(100%-1rem)]
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — arbitrary values', () => {
  test('p-[10px] sorts in spacing group', () => {
    expect(check(`<div className="flex p-[10px]">`)).toHaveLength(0)
    expect(check(`<div className="p-[10px] flex">`).length).toBeGreaterThan(0)
  })

  test('fix: p-[10px] after flex', () => {
    expect(classes(fix(`<div className="p-[10px] flex">`))).toBe('flex p-[10px]')
  })

  test('bg-[#ff0000] sorts in backgrounds group', () => {
    expect(check(`<div className="flex bg-[#ff0000]">`)).toHaveLength(0)
    expect(check(`<div className="bg-[#ff0000] flex">`).length).toBeGreaterThan(0)
  })

  test('fix: bg-[#ff0000] after flex', () => {
    expect(classes(fix(`<div className="bg-[#ff0000] flex">`))).toBe('flex bg-[#ff0000]')
  })

  test('w-[calc(100%-1rem)] sorts in sizing group', () => {
    expect(check(`<div className="flex w-[calc(100%-1rem)]">`)).toHaveLength(0)
    expect(check(`<div className="w-[calc(100%-1rem)] flex">`).length).toBeGreaterThan(0)
  })

  test('fix: w-[calc(100%-1rem)] after flex', () => {
    expect(classes(fix(`<div className="w-[calc(100%-1rem)] flex">`))).toBe('flex w-[calc(100%-1rem)]')
  })

  test('text-[1.5rem] sorts in typography group', () => {
    expect(check(`<div className="flex text-[1.5rem]">`)).toHaveLength(0)
    expect(check(`<div className="text-[1.5rem] flex">`).length).toBeGreaterThan(0)
  })

  test('mt-[20px] sorts in spacing group', () => {
    expect(check(`<div className="flex mt-[20px]">`)).toHaveLength(0)
    expect(check(`<div className="mt-[20px] flex">`).length).toBeGreaterThan(0)
  })

  test('grid-cols-[1fr_2fr] sorts in flexbox/grid group', () => {
    expect(check(`<div className="flex grid-cols-[1fr_2fr]">`)).toHaveLength(0)
    expect(check(`<div className="grid-cols-[1fr_2fr] flex">`).length).toBeGreaterThan(0)
  })

  test('bg-[url(image.png)] sorts in backgrounds group', () => {
    expect(check(`<div className="flex bg-[url(image.png)]">`)).toHaveLength(0)
    expect(check(`<div className="bg-[url(image.png)] flex">`).length).toBeGreaterThan(0)
  })

  test('text-[clamp(1rem,2vw,3rem)] sorts in typography group', () => {
    expect(check(`<div className="flex text-[clamp(1rem,2vw,3rem)]">`)).toHaveLength(0)
    expect(check(`<div className="text-[clamp(1rem,2vw,3rem)] flex">`).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Arbitrary properties: [mask-type:alpha], [--custom-var:value]
// The colon inside [...] must NOT be treated as a variant prefix separator
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — arbitrary properties', () => {
  test('[mask-type:alpha] is treated as unknown (group 99), sorts after known groups', () => {
    // flex (group 0) before [mask-type:alpha] (group 99) — already sorted
    expect(check(`<div className="flex [mask-type:alpha]">`)).toHaveLength(0)
  })

  test('[mask-type:alpha] before flex triggers issue', () => {
    expect(check(`<div className="[mask-type:alpha] flex">`).length).toBeGreaterThan(0)
  })

  test('fix: [mask-type:alpha] moves after flex', () => {
    expect(classes(fix(`<div className="[mask-type:alpha] flex">`))).toBe('flex [mask-type:alpha]')
  })

  test('[--custom-var:value] treated as unknown, sorts last', () => {
    expect(check(`<div className="flex p-4 [--custom-var:value]">`)).toHaveLength(0)
    expect(check(`<div className="[--custom-var:value] flex p-4">`).length).toBeGreaterThan(0)
  })

  test('fix: [--custom-var:value] moves to end', () => {
    const result = classes(fix(`<div className="[--custom-var:value] flex p-4">`))
    expect(result.endsWith('[--custom-var:value]')).toBe(true)
    expect(result.startsWith('flex')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Important modifier: !p-4, !flex, hover:!bg-red-500
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — important modifier (!)', () => {
  test('!p-4 sorts in spacing group (same as p-4)', () => {
    // flex (group 0) before !p-4 (group 3) — sorted
    expect(check(`<div className="flex !p-4">`)).toHaveLength(0)
  })

  test('!p-4 before flex triggers issue', () => {
    expect(check(`<div className="!p-4 flex">`).length).toBeGreaterThan(0)
  })

  test('fix: !p-4 moves after flex', () => {
    expect(classes(fix(`<div className="!p-4 flex">`))).toBe('flex !p-4')
  })

  test('!flex sorts in layout group', () => {
    expect(check(`<div className="!flex p-4">`)).toHaveLength(0)
  })

  test('!bg-white sorts in backgrounds group', () => {
    expect(check(`<div className="flex !bg-white">`)).toHaveLength(0)
    expect(check(`<div className="!bg-white flex">`).length).toBeGreaterThan(0)
  })

  test('hover:!bg-red-500 sorts as hover variant of backgrounds', () => {
    // bg-blue-500 (base, group 6) before hover:!bg-red-500 (hover variant, group 6)
    expect(check(`<div className="bg-blue-500 hover:!bg-red-500">`)).toHaveLength(0)
    expect(check(`<div className="hover:!bg-red-500 bg-blue-500">`).length).toBeGreaterThan(0)
  })

  test('fix: hover:!bg-red-500 stays after base bg class', () => {
    const result = classes(fix(`<div className="hover:!bg-red-500 bg-blue-500">`))
    const parts = result.split(' ')
    expect(parts.indexOf('bg-blue-500')).toBeLessThan(parts.indexOf('hover:!bg-red-500'))
  })
})

// ---------------------------------------------------------------------------
// Spaces inside brackets: p-[calc(100% - 1rem)]
// parseClasses must NOT split on the space inside [...]
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — spaces inside arbitrary brackets', () => {
  test('p-[calc(100% - 1rem)] is treated as a single class token', () => {
    // If it were split on the space, we'd get garbage tokens — the check should
    // either produce 0 issues (already sorted) or exactly 1 (unsorted), never crash
    const code = `<div className="flex p-[calc(100% - 1rem)]">`
    const issues = check(code)
    expect(issues).toHaveLength(0)
  })

  test('p-[calc(100% - 1rem)] before flex triggers exactly 1 issue', () => {
    const code = `<div className="p-[calc(100% - 1rem)] flex">`
    const issues = check(code)
    expect(issues).toHaveLength(1)
  })

  test('fix: p-[calc(100% - 1rem)] moves after flex as single token', () => {
    const code = `<div className="p-[calc(100% - 1rem)] flex">`
    const result = fix(code)
    // The entire calc expression must survive intact as one token
    expect(result).toContain('"flex p-[calc(100% - 1rem)]"')
  })

  test('bg-[url(some image.png)] treated as single token', () => {
    const code = `<div className="flex bg-[url(some image.png)]">`
    expect(check(code)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Stacked variants: dark:hover:bg-[#000], sm:hover:p-4
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — stacked variants', () => {
  test('dark:hover:bg-[#000] sorts after base bg class', () => {
    expect(check(`<div className="bg-white dark:hover:bg-[#000]">`)).toHaveLength(0)
    expect(check(`<div className="dark:hover:bg-[#000] bg-white">`).length).toBeGreaterThan(0)
  })

  test('fix: dark:hover:bg-[#000] moves after bg-white', () => {
    const result = classes(fix(`<div className="dark:hover:bg-[#000] bg-white">`))
    const parts = result.split(' ')
    expect(parts.indexOf('bg-white')).toBeLessThan(parts.indexOf('dark:hover:bg-[#000]'))
  })

  test('sm:hover:p-4 sorts after base p-4 and sm:p-4', () => {
    expect(check(`<div className="p-4 sm:p-4 sm:hover:p-4">`)).toHaveLength(0)
    expect(check(`<div className="sm:hover:p-4 p-4">`).length).toBeGreaterThan(0)
  })

  test('responsive + arbitrary: sm:p-[10px] sorts after base p-4', () => {
    expect(check(`<div className="p-4 sm:p-[10px]">`)).toHaveLength(0)
    expect(check(`<div className="sm:p-[10px] p-4">`).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Idempotency: fix applied twice gives same result for all edge cases
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — idempotency of edge cases', () => {
  const edgeCases = [
    `<div className="p-[10px] flex">`,
    `<div className="[mask-type:alpha] flex p-4">`,
    `<div className="!p-4 flex">`,
    `<div className="hover:!bg-red-500 bg-blue-500 flex">`,
    `<div className="p-[calc(100% - 1rem)] flex">`,
    `<div className="dark:hover:bg-[#000] bg-white flex">`,
    `<div className="sm:p-[10px] p-4 flex">`,
  ]

  for (const code of edgeCases) {
    test(`idempotent: ${code.slice(0, 50)}`, () => {
      const once = fix(code)
      const twice = fix(once)
      expect(once).toBe(twice)
    })
  }
})
