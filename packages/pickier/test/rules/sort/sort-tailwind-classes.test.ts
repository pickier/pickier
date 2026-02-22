import { describe, expect, test } from 'bun:test'
import type { RuleContext } from '../../../src/types'
import { sortTailwindClassesRule } from '../../../src/rules/sort/tailwind-classes'

const ctx: RuleContext = {
  filePath: '/test/file.tsx',
  config: {} as any,
}

const htmlCtx: RuleContext = { ...ctx, filePath: '/test/file.html' }
const vueCtx: RuleContext = { ...ctx, filePath: '/test/file.vue' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(content: string, filePath = '/test/file.tsx') {
  return sortTailwindClassesRule.check(content, { ...ctx, filePath })
}

function fix(content: string, filePath = '/test/file.tsx') {
  return sortTailwindClassesRule.fix!(content, { ...ctx, filePath })
}

// ---------------------------------------------------------------------------
// Group ordering — sorted inputs should produce zero issues
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — check: already sorted', () => {
  test('single class — no issue', () => {
    expect(check(`<div className="flex">`)).toHaveLength(0)
  })

  test('two classes in correct order (layout before spacing)', () => {
    expect(check(`<div className="flex p-4">`)).toHaveLength(0)
  })

  test('layout → flexbox → spacing → sizing → typography order', () => {
    const code = `<div className="flex flex-col gap-4 p-4 w-full text-sm">`
    expect(check(code)).toHaveLength(0)
  })

  test('backgrounds after typography', () => {
    const code = `<div className="text-white bg-blue-500">`
    expect(check(code)).toHaveLength(0)
  })

  test('borders after backgrounds', () => {
    const code = `<div className="bg-white border rounded">`
    expect(check(code)).toHaveLength(0)
  })

  test('transitions after effects', () => {
    // Within group 11 (transitions), duration-200 sorts before transition alphabetically
    const code = `<div className="shadow-md duration-200 transition">`
    expect(check(code)).toHaveLength(0)
  })

  test('base classes before responsive variants', () => {
    const code = `<div className="flex sm:flex-col md:flex-row">`
    expect(check(code)).toHaveLength(0)
  })

  test('responsive variants in sm→md→lg→xl→2xl order', () => {
    const code = `<div className="p-2 sm:p-4 md:p-6 lg:p-8 xl:p-10 2xl:p-12">`
    expect(check(code)).toHaveLength(0)
  })

  test('state variants after responsive variants', () => {
    const code = `<div className="bg-blue-500 hover:bg-blue-600">`
    expect(check(code)).toHaveLength(0)
  })

  test('single-quoted class attribute', () => {
    expect(check(`<div class='flex p-4'>`)).toHaveLength(0)
  })

  test('empty class string — no issue', () => {
    expect(check(`<div className="">`)).toHaveLength(0)
  })

  test('whitespace-only class string — no issue', () => {
    expect(check(`<div className="   ">`)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// check: unsorted inputs should produce issues
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — check: unsorted', () => {
  test('spacing before layout triggers issue', () => {
    const issues = check(`<div className="p-4 flex">`)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].ruleId).toBe('pickier/sort-tailwind-classes')
    expect(issues[0].severity).toBe('warning')
  })

  test('typography before layout triggers issue', () => {
    const issues = check(`<div className="text-sm flex">`)
    expect(issues.length).toBeGreaterThan(0)
  })

  test('background before layout triggers issue', () => {
    const issues = check(`<div className="bg-white flex">`)
    expect(issues.length).toBeGreaterThan(0)
  })

  test('border before spacing triggers issue', () => {
    const issues = check(`<div className="border p-4">`)
    expect(issues.length).toBeGreaterThan(0)
  })

  test('hover variant before base class triggers issue', () => {
    const issues = check(`<div className="hover:bg-blue-600 bg-blue-500">`)
    expect(issues.length).toBeGreaterThan(0)
  })

  test('xl before sm triggers issue', () => {
    const issues = check(`<div className="xl:p-10 sm:p-4">`)
    expect(issues.length).toBeGreaterThan(0)
  })

  test('message includes rule id', () => {
    const issues = check(`<div className="p-4 flex">`)
    expect(issues[0].message).toContain('Tailwind')
  })

  test('reports correct line number', () => {
    const code = `const x = 1\n<div className="p-4 flex">`
    const issues = check(code)
    expect(issues[0].line).toBe(2)
  })

  test('reports correct column', () => {
    const code = `<div className="p-4 flex">`
    const issues = check(code)
    expect(issues[0].column).toBeGreaterThan(0)
  })

  test('multiple unsorted attributes on different lines', () => {
    const code = `<div className="p-4 flex">\n<span className="text-sm block">`
    const issues = check(code)
    expect(issues.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// check: HTML class= attribute
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — check: HTML class=', () => {
  test('sorted class= — no issue', () => {
    const code = `<div class="flex p-4">`
    expect(check(code, '/test/file.html')).toHaveLength(0)
  })

  test('unsorted class= — issue', () => {
    const code = `<div class="p-4 flex">`
    expect(check(code, '/test/file.html').length).toBeGreaterThan(0)
  })

  test('single-quoted class= — sorted no issue', () => {
    expect(check(`<div class='flex p-4'>`, '/test/file.html')).toHaveLength(0)
  })

  test('single-quoted class= — unsorted issue', () => {
    expect(check(`<div class='p-4 flex'>`, '/test/file.html').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// check: Vue :class= binding
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — check: :class= binding', () => {
  test('sorted :class= — no issue', () => {
    expect(check(`<div :class="flex p-4">`, '/test/file.vue')).toHaveLength(0)
  })

  test('unsorted :class= — issue', () => {
    expect(check(`<div :class="p-4 flex">`, '/test/file.vue').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// check: utility function calls
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — check: utility functions', () => {
  test('clsx sorted — no issue', () => {
    expect(check(`const c = clsx("flex p-4")`)).toHaveLength(0)
  })

  test('clsx unsorted — issue', () => {
    expect(check(`const c = clsx("p-4 flex")`).length).toBeGreaterThan(0)
  })

  test('cn sorted — no issue', () => {
    expect(check(`const c = cn("flex p-4")`)).toHaveLength(0)
  })

  test('cn unsorted — issue', () => {
    expect(check(`const c = cn("p-4 flex")`).length).toBeGreaterThan(0)
  })

  test('tw sorted — no issue', () => {
    expect(check(`const c = tw("flex p-4")`)).toHaveLength(0)
  })

  test('tw unsorted — issue', () => {
    expect(check(`const c = tw("p-4 flex")`).length).toBeGreaterThan(0)
  })

  test('cva sorted — no issue', () => {
    expect(check(`const c = cva("flex p-4")`)).toHaveLength(0)
  })

  test('cva unsorted — issue', () => {
    expect(check(`const c = cva("p-4 flex")`).length).toBeGreaterThan(0)
  })

  test('tv sorted — no issue', () => {
    expect(check(`const c = tv("flex p-4")`)).toHaveLength(0)
  })

  test('tv unsorted — issue', () => {
    expect(check(`const c = tv("p-4 flex")`).length).toBeGreaterThan(0)
  })

  test('single-quoted utility call — unsorted issue', () => {
    expect(check(`const c = cn('p-4 flex')`).length).toBeGreaterThan(0)
  })

  test('single-quoted utility call — sorted no issue', () => {
    expect(check(`const c = cn('flex p-4')`)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// fix: basic sorting
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — fix: basic rewriting', () => {
  test('sorts spacing before layout → layout first', () => {
    const result = fix(`<div className="p-4 flex">`)
    expect(result).toContain('"flex p-4"')
  })

  test('sorts typography after layout', () => {
    const result = fix(`<div className="text-sm flex">`)
    expect(result).toContain('"flex text-sm"')
  })

  test('sorts full realistic class list', () => {
    const result = fix(`<div className="mt-4 flex text-sm bg-white p-2 rounded border">`)
    expect(result).toContain('"flex')
    const sorted = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(sorted.indexOf('flex')).toBeLessThan(sorted.indexOf('bg-white'))
    expect(sorted.indexOf('bg-white')).toBeLessThan(sorted.indexOf('rounded'))
    expect(sorted.indexOf('p-2')).toBeLessThan(sorted.indexOf('bg-white'))
  })

  test('fix is idempotent — running twice gives same result', () => {
    const code = `<div className="mt-4 flex text-sm bg-white p-2 rounded border">`
    const once = fix(code)
    const twice = fix(once)
    expect(once).toBe(twice)
  })

  test('already-sorted input is unchanged by fix', () => {
    const code = `<div className="flex p-4">`
    expect(fix(code)).toBe(code)
  })

  test('fix preserves surrounding code', () => {
    const code = `const x = 1\n<div className="p-4 flex">\nconst y = 2`
    const result = fix(code)
    expect(result).toContain('const x = 1')
    expect(result).toContain('const y = 2')
    expect(result).toContain('"flex p-4"')
  })

  test('fix handles multiple attributes in same file', () => {
    const code = `<div className="p-4 flex">\n<span className="text-sm block">`
    const result = fix(code)
    expect(result).toContain('"flex p-4"')
    expect(result).toContain('"block text-sm"')
  })

  test('fix rewrites HTML class= attribute', () => {
    const result = fix(`<div class="p-4 flex">`, '/test/file.html')
    expect(result).toContain('"flex p-4"')
  })

  test('fix rewrites single-quoted attribute', () => {
    const result = fix(`<div className='p-4 flex'>`)
    expect(result).toContain("'flex p-4'")
  })

  test('fix rewrites clsx call', () => {
    const result = fix(`const c = clsx("p-4 flex")`)
    expect(result).toContain('"flex p-4"')
  })

  test('fix rewrites cn call', () => {
    const result = fix(`const c = cn("p-4 flex")`)
    expect(result).toContain('"flex p-4"')
  })
})

// ---------------------------------------------------------------------------
// fix: variant ordering
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — fix: variant ordering', () => {
  test('base class before hover variant', () => {
    const result = fix(`<div className="hover:bg-blue-600 bg-blue-500">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('bg-blue-500')).toBeLessThan(classes.indexOf('hover:bg-blue-600'))
  })

  test('sm: before md: before lg:', () => {
    const result = fix(`<div className="lg:p-8 sm:p-4 md:p-6">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('sm:p-4')).toBeLessThan(classes.indexOf('md:p-6'))
    expect(classes.indexOf('md:p-6')).toBeLessThan(classes.indexOf('lg:p-8'))
  })

  test('base before sm before hover', () => {
    const result = fix(`<div className="hover:text-white sm:text-gray-500 text-black">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('text-black')).toBeLessThan(classes.indexOf('sm:text-gray-500'))
    expect(classes.indexOf('sm:text-gray-500')).toBeLessThan(classes.indexOf('hover:text-white'))
  })
})

// ---------------------------------------------------------------------------
// fix: group ordering verification
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — fix: group order', () => {
  test('layout (flex) before flexbox (gap-4)', () => {
    const result = fix(`<div className="gap-4 flex">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('flex')).toBeLessThan(classes.indexOf('gap-4'))
  })

  test('flexbox (gap-4) before spacing (p-4)', () => {
    const result = fix(`<div className="p-4 gap-4">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('gap-4')).toBeLessThan(classes.indexOf('p-4'))
  })

  test('spacing (p-4) before sizing (w-full)', () => {
    const result = fix(`<div className="w-full p-4">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('p-4')).toBeLessThan(classes.indexOf('w-full'))
  })

  test('sizing (w-full) before typography (text-sm)', () => {
    const result = fix(`<div className="text-sm w-full">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('w-full')).toBeLessThan(classes.indexOf('text-sm'))
  })

  test('typography (text-sm) before backgrounds (bg-white)', () => {
    const result = fix(`<div className="bg-white text-sm">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('text-sm')).toBeLessThan(classes.indexOf('bg-white'))
  })

  test('backgrounds (bg-white) before borders (border)', () => {
    const result = fix(`<div className="border bg-white">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('bg-white')).toBeLessThan(classes.indexOf('border'))
  })

  test('borders (border) before effects (shadow-md)', () => {
    const result = fix(`<div className="shadow-md border">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('border')).toBeLessThan(classes.indexOf('shadow-md'))
  })

  test('effects (shadow-md) before transitions (transition)', () => {
    const result = fix(`<div className="transition shadow-md">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('shadow-md')).toBeLessThan(classes.indexOf('transition'))
  })

  test('transitions (transition) before transforms (scale-105)', () => {
    const result = fix(`<div className="scale-105 transition">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('transition')).toBeLessThan(classes.indexOf('scale-105'))
  })

  test('transforms (scale-105) before interactivity (cursor-pointer)', () => {
    const result = fix(`<div className="cursor-pointer scale-105">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('scale-105')).toBeLessThan(classes.indexOf('cursor-pointer'))
  })

  test('sr-only (accessibility) sorts last among known groups', () => {
    const result = fix(`<div className="sr-only flex p-4">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes[classes.length - 1]).toBe('sr-only')
  })
})

// ---------------------------------------------------------------------------
// edge cases
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — edge cases', () => {
  test('unknown classes sort after known groups', () => {
    const result = fix(`<div className="my-custom-class flex">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('flex')).toBeLessThan(classes.indexOf('my-custom-class'))
  })

  test('no false positive on non-class attributes', () => {
    const code = `<div id="p-4 flex" data-value="something">`
    expect(check(code)).toHaveLength(0)
  })

  test('no false positive on code without class attributes', () => {
    const code = `const x = 1\nfunction foo() { return 'bar' }`
    expect(check(code)).toHaveLength(0)
  })

  test('does not modify non-class strings', () => {
    const code = `const msg = "hello world"\n<div className="p-4 flex">`
    const result = fix(code)
    expect(result).toContain('"hello world"')
    expect(result).toContain('"flex p-4"')
  })

  test('handles extra whitespace between classes', () => {
    const issues = check(`<div className="p-4  flex">`)
    expect(issues.length).toBeGreaterThan(0)
  })

  test('fix collapses extra whitespace to single spaces', () => {
    const result = fix(`<div className="p-4  flex">`)
    expect(result).toContain('"flex p-4"')
  })

  test('negative margin classes sort in spacing group', () => {
    const result = fix(`<div className="flex -mt-4">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('flex')).toBeLessThan(classes.indexOf('-mt-4'))
  })

  test('inline-flex sorts in layout group', () => {
    const result = fix(`<div className="p-4 inline-flex">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('inline-flex')).toBeLessThan(classes.indexOf('p-4'))
  })

  test('hidden sorts in layout group', () => {
    const result = fix(`<div className="p-4 hidden">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('hidden')).toBeLessThan(classes.indexOf('p-4'))
  })

  test('absolute sorts in layout group', () => {
    const result = fix(`<div className="p-4 absolute">`)
    const classes = result.match(/"([^"]+)"/)?.[1].split(' ') ?? []
    expect(classes.indexOf('absolute')).toBeLessThan(classes.indexOf('p-4'))
  })

  test('multiple className attributes on same line — both fixed', () => {
    const code = `<A className="p-4 flex" /><B className="text-sm block" />`
    const result = fix(code)
    expect(result).toContain('"flex p-4"')
    expect(result).toContain('"block text-sm"')
  })
})

// ---------------------------------------------------------------------------
// rule metadata
// ---------------------------------------------------------------------------

describe('sort-tailwind-classes — rule metadata', () => {
  test('has meta.docs', () => {
    expect(sortTailwindClassesRule.meta?.docs).toBeTruthy()
  })

  test('has fix function', () => {
    expect(typeof sortTailwindClassesRule.fix).toBe('function')
  })

  test('has check function', () => {
    expect(typeof sortTailwindClassesRule.check).toBe('function')
  })
})
