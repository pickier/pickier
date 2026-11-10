import type { RuleContext } from '../../../src/types'
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint, runLintProgrammatic } from '../../../src/linter'
import { pickierPlugin } from '../../../src/plugins/pickier'
import { findMarginSpacedParents, noMarginSpacedComponentsRule } from '../../../src/rules/stx/no-margin-spaced-components'

const RULE_ID = 'pickier/no-margin-spaced-components'

const ctx: RuleContext = {
  filePath: '/test/view.stx',
  config: {} as any,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(content: string, options?: unknown) {
  return noMarginSpacedComponentsRule.check(content, { ...ctx, options })
}

/** What was found, without positions: `tag | utilities | components` */
function found(content: string, boxed?: string[]) {
  return findMarginSpacedParents(content, boxed).map(parent =>
    `${parent.tag} | ${parent.spacing.map(utility => utility.token).join(' ')} | ${parent.components.join(' ')}`)
}

// ---------------------------------------------------------------------------
// Reported
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - check: reported', () => {
  test('space-y parent of two components', () => {
    const issues = check('<form class="space-y-5"><PasskeySignIn /><SocialSignIn /></form>')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.ruleId).toBe(RULE_ID)
    expect(issues[0]!.severity).toBe('warning')
    expect(issues[0]!.message).toBe('space-y-5 puts a margin between siblings, which never reaches <PasskeySignIn> and <SocialSignIn>: stx can draw a component inside a wrapper with display: contents, which takes no box. Use "flex flex-col gap-5" instead of space-y-5.')
    expect(issues[0]!.help).toContain('self-start')
    expect(issues[0]!.help).toContain('boxedComponents')
  })

  test('space-x suggests a row', () => {
    const [issue] = check('<div class="space-x-2"><Avatar /><p>x</p></div>')
    expect(issue!.message).toContain('Use "flex gap-2" instead of space-x-2.')
  })

  test('one component among plain elements is enough', () => {
    expect(found('<div class="space-y-3"><p>a</p><Skeleton /><p>b</p></div>')).toEqual(['div | space-y-3 | Skeleton'])
  })

  test('a component with children of its own', () => {
    expect(found('<div class="space-y-3"><Card><p>a</p></Card><p>b</p></div>')).toEqual(['div | space-y-3 | Card'])
  })

  test('each component is named once', () => {
    const [issue] = check('<div class="space-y-3"><Skeleton class="h-20" /><Skeleton class="h-20" /></div>')
    expect(issue!.message).toContain('never reaches <Skeleton>:')
  })

  test('three components are listed with commas', () => {
    const [issue] = check('<div class="space-y-3"><A /><B /><C /></div>')
    expect(issue!.message).toContain('never reaches <A>, <B> and <C>:')
  })

  test('arbitrary and fractional values keep their value', () => {
    expect(check('<div class="space-y-[13px]"><A /></div>')[0]!.message).toContain('"flex flex-col gap-[13px]"')
    expect(check('<div class="space-x-2.5"><A /></div>')[0]!.message).toContain('"flex gap-2.5"')
  })

  test('the parent may be any element, a component included', () => {
    expect(found('<section class="space-y-8"><Hero /></section>')).toEqual(['section | space-y-8 | Hero'])
    expect(found('<Card class="space-y-4"><Row /></Card>')).toEqual(['Card | space-y-4 | Row'])
  })

  test('nested offenders are each reported, outermost first', () => {
    const src = '<div class="space-y-6">\n  <Header />\n  <div class="space-x-2">\n    <Chip />\n  </div>\n</div>'
    expect(found(src)).toEqual(['div | space-y-6 | Header', 'div | space-x-2 | Chip'])
    expect(check(src).map(issue => issue.line)).toEqual([1, 3])
  })

  test('a component behind a stx directive is still a direct child', () => {
    expect(found('<div class="space-y-3">\n@if (ready)\n  <Chart />\n@endif\n</div>')).toEqual(['div | space-y-3 | Chart'])
  })

  test('a parent left open by an unclosed <p> is still found', () => {
    expect(found('<div class="space-y-3"><Badge /><p>intro</div>')).toEqual(['div | space-y-3 | Badge'])
  })

  test('a stray closing tag does not end the parent early', () => {
    expect(found('<div class="space-y-3"><p>a</p></span><Badge /></div>')).toEqual(['div | space-y-3 | Badge'])
  })

  test('an element that is never closed still answers for its children', () => {
    expect(found('<div class="space-y-3"><Badge />')).toEqual(['div | space-y-3 | Badge'])
  })
})

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - check: variants', () => {
  test('a responsive prefix is kept on every suggested class', () => {
    const [issue] = check('<form class="md:space-y-5"><PasskeySignIn /></form>')
    expect(issue!.message).toContain('Use "md:flex md:flex-col md:gap-5" instead of md:space-y-5.')
  })

  test('stacked and hyphenated variants', () => {
    expect(check('<div class="dark:md:space-x-4"><A /></div>')[0]!.message).toContain('"dark:md:flex dark:md:gap-4"')
    expect(check('<div class="max-md:space-y-3"><A /></div>')[0]!.message).toContain('"max-md:flex max-md:flex-col max-md:gap-3"')
    expect(check('<div class="2xl:space-y-3"><A /></div>')[0]!.message).toContain('"2xl:flex 2xl:flex-col 2xl:gap-3"')
  })

  test('an arbitrary variant may contain a colon', () => {
    expect(check('<div class="[&:not(.x)]:space-y-3"><A /></div>')[0]!.message).toContain('"[&:not(.x)]:flex [&:not(.x)]:flex-col [&:not(.x)]:gap-3"')
  })

  test('several utilities on one element are one issue with advice for each', () => {
    const issues = check('<div class="space-y-3 md:space-y-5"><A /></div>')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('space-y-3 and md:space-y-5 puts a margin')
    expect(issues[0]!.message).toContain('Use "flex flex-col gap-3" instead of space-y-3. Use "md:flex md:flex-col md:gap-5" instead of md:space-y-5.')
  })

  test('the important modifier is carried over', () => {
    expect(check('<div class="!space-y-3"><A /></div>')[0]!.message).toContain('"!flex !flex-col !gap-3"')
    expect(check('<div class="md:space-y-3!"><A /></div>')[0]!.message).toContain('"md:!flex md:!flex-col md:!gap-3"')
  })

  test('a negative space has no gap to suggest', () => {
    const [issue] = check('<div class="-space-x-2"><Avatar /><Avatar /></div>')
    expect(issue!.message).toContain('-space-x-2 has no gap equivalent')
    expect(issue!.message).not.toContain('Use "')
  })
})

// ---------------------------------------------------------------------------
// divide-*
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - check: divide', () => {
  test('divide-y is reported with no gap suggestion', () => {
    const [issue] = check('<ul class="divide-y"><Row /><Row /></ul>')
    expect(issue!.message).toBe('divide-y puts a border between siblings, which never reaches <Row>: stx can draw a component inside a wrapper with display: contents, which takes no box. divide-y has no gap equivalent: draw the border on the items themselves, or wrap each component in an element.')
  })

  test('divide-x, widths and variants', () => {
    expect(found('<div class="divide-x"><A /></div>')).toEqual(['div | divide-x | A'])
    expect(found('<div class="divide-y-2"><A /></div>')).toEqual(['div | divide-y-2 | A'])
    expect(found('<div class="md:divide-x-[3px]"><A /></div>')).toEqual(['div | md:divide-x-[3px] | A'])
  })

  test('space and divide together', () => {
    const [issue] = check('<div class="space-y-4 divide-y"><A /></div>')
    expect(issue!.message).toContain('space-y-4 and divide-y puts margins and borders between siblings')
    expect(issue!.message).toContain('Use "flex flex-col gap-4" instead of space-y-4. divide-y has no gap equivalent')
  })

  test('a divide colour or style alone draws nothing between siblings', () => {
    expect(found('<div class="divide-slate-200 divide-dashed"><A /></div>')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Not reported
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - check: not reported', () => {
  test('a gap-spaced parent', () => {
    expect(check('<form class="flex flex-col gap-5"><PasskeySignIn /><SocialSignIn /></form>')).toHaveLength(0)
    expect(check('<div class="grid gap-x-4 gap-y-2"><Card /></div>')).toHaveLength(0)
  })

  test('no components among the children', () => {
    expect(check('<div class="space-y-3"><p>a</p><button>b</button><my-element></my-element></div>')).toHaveLength(0)
  })

  test('a component that is not a DIRECT child has its own parent to answer for it', () => {
    expect(check('<div class="space-y-3"><section><Skeleton /></section></div>')).toHaveLength(0)
    expect(check('<div class="space-y-3"><p>a</p><div class="flex gap-2"><Chip /></div></div>')).toHaveLength(0)
  })

  test('a component that is a sibling or a parent of the spaced element', () => {
    expect(check('<Hero /><div class="space-y-3"><p>a</p></div><Footer />')).toHaveLength(0)
    expect(check('<Card><div class="space-y-3"><p>a</p><p>b</p></div></Card>')).toHaveLength(0)
  })

  test('StxLink is drawn as its own anchor', () => {
    expect(check('<div class="space-y-3"><p>x</p><StxLink to="/">y</StxLink></div>')).toHaveLength(0)
    expect(check('<nav class="space-x-4"><StxLink to="/" /><StxLink to="/about" /></nav>')).toHaveLength(0)
  })

  test('components inside a script', () => {
    expect(check('<div class="space-y-3">\n<script>\nconst html = "<Skeleton />"\n</script>\n<p>a</p></div>')).toHaveLength(0)
    expect(check('<script server>\nconst tpl = `<div class="space-y-3"><Skeleton /></div>`\n</script>\n<p>a</p>')).toHaveLength(0)
  })

  test('components inside a style block', () => {
    expect(check('<div class="space-y-3"><style>/* <Skeleton /> */</style><p>a</p></div>')).toHaveLength(0)
  })

  test('components inside a comment', () => {
    expect(check('<div class="space-y-3">\n<!-- <Skeleton /> -->\n<p>a</p></div>')).toHaveLength(0)
    expect(check('<!--\n<div class="space-y-3">\n  <Skeleton />\n</div>\n-->')).toHaveLength(0)
  })

  test('a component named in an attribute value or in text', () => {
    expect(check('<div class="space-y-3"><p title="<Skeleton />">a</p></div>')).toHaveLength(0)
    expect(check('<div class="space-y-3"><p>Skeleton</p></div>')).toHaveLength(0)
  })

  test('space-*-reverse and divide-*-reverse alone set no margin or border', () => {
    expect(check('<div class="flex flex-col-reverse space-y-reverse"><A /></div>')).toHaveLength(0)
    expect(check('<div class="divide-x-reverse"><A /></div>')).toHaveLength(0)
  })

  test('utilities that only look alike', () => {
    expect(check('<div class="whitespace-y-3 myspace-x-2 tracking-wide space-3"><A /></div>')).toHaveLength(0)
  })

  test('the utility on a void or self-closing element', () => {
    expect(check('<input class="space-y-3"><Field />')).toHaveLength(0)
    expect(check('<div class="space-y-3" /><Field />')).toHaveLength(0)
  })

  test('the utility in an attribute other than class', () => {
    expect(check('<div data-note="space-y-3" title="space-y-3"><A /></div>')).toHaveLength(0)
  })

  test('a file with no such utility is not walked', () => {
    expect(findMarginSpacedParents('<div class="flex gap-2"><A /></div>')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Class attribute forms
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - check: class attributes', () => {
  test('single-quoted class', () => {
    expect(found(`<div class='space-y-3'><A /></div>`)).toEqual(['div | space-y-3 | A'])
  })

  test(':class with a plain string', () => {
    expect(found('<div :class="space-y-3 p-4"><A /></div>')).toEqual(['div | space-y-3 | A'])
  })

  test(':class with a ternary of string literals', () => {
    expect(found(`<div :class="open ? 'space-y-4' : 'space-y-2'"><A /></div>`)).toEqual(['div | space-y-4 space-y-2 | A'])
  })

  test(':class with an object', () => {
    expect(found(`<div :class="{ 'md:space-x-3': wide }"><A /></div>`)).toEqual(['div | md:space-x-3 | A'])
  })

  test('x-class and x-bind:class', () => {
    expect(found(`<div x-class="'space-y-3'"><A /></div>`)).toEqual(['div | space-y-3 | A'])
    expect(found(`<div x-bind:class="'space-y-3'"><A /></div>`)).toEqual(['div | space-y-3 | A'])
  })

  test('class and :class on one element are read together', () => {
    expect(found(`<div class="space-y-3" :class="{ 'divide-y': lined }"><A /></div>`)).toEqual(['div | space-y-3 divide-y | A'])
  })

  test('the same utility in class and :class is named once', () => {
    expect(found(`<div class="space-y-3" :class="ready ? 'space-y-3' : ''"><A /></div>`)).toEqual(['div | space-y-3 | A'])
  })

  test('an attribute value holding > does not end the tag', () => {
    expect(found('<div :if="count > 0" class="space-y-3"><A /></div>')).toEqual(['div | space-y-3 | A'])
  })
})

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - check: position', () => {
  test('reported at the class attribute', () => {
    const [issue] = check('<form id="f" class="space-y-5"><PasskeySignIn /></form>')
    expect(issue!.line).toBe(1)
    expect(issue!.column).toBe(14)
  })

  test('a multi-line tag is reported on the line of its class attribute', () => {
    const src = '<main>\n  <form\n    @submit="save($event)"\n    class="p-8 space-y-5"\n  >\n    <PasskeySignIn />\n  </form>\n</main>'
    const [issue] = check(src)
    expect(issue!.line).toBe(4)
    expect(issue!.column).toBe(5)
  })

  test('with class and :class, the attribute that holds the utility', () => {
    const src = '<div\n  class="p-4"\n  :class="{ \'space-y-3\': stacked }"\n>\n  <A />\n</div>'
    const [issue] = check(src)
    expect(issue!.line).toBe(3)
    expect(issue!.column).toBe(3)
  })

  test('lines after a blanked script and comment still count', () => {
    const src = '<script server>\nconst a = 1\n</script>\n<!--\n  note\n-->\n<div class="space-y-3">\n  <A />\n</div>'
    expect(check(src)[0]!.line).toBe(7)
  })

  test('issues come in source order', () => {
    const src = '<div class="space-y-1"><A /></div>\n<div class="space-y-2"><p>x</p></div>\n<div class="space-y-3"><B /></div>'
    expect(check(src).map(issue => issue.line)).toEqual([1, 3])
  })
})

// ---------------------------------------------------------------------------
// Disable comments
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - disable comments', () => {
  const el = '<div class="space-y-3"><A /></div>'

  test('a comment before the element, naming the rule in full or in short', () => {
    expect(check(`<!-- pickier-disable-next-line ${RULE_ID} -->\n${el}`)).toHaveLength(0)
    expect(check(`<!-- pickier-disable-next-line no-margin-spaced-components -->\n${el}`)).toHaveLength(0)
    expect(check(`<!-- eslint-disable-next-line ${RULE_ID} -->\n${el}`)).toHaveLength(0)
  })

  test('naming no rule disables every rule', () => {
    expect(check(`<!-- pickier-disable-next-line -->\n${el}`)).toHaveLength(0)
  })

  test('one of several rules, and a reason after --', () => {
    expect(check(`<!-- pickier-disable-next-line pickier/sort-tailwind-classes, ${RULE_ID} -- Row has no client script -->\n${el}`)).toHaveLength(0)
  })

  test('a comment naming another rule does not', () => {
    expect(check(`<!-- pickier-disable-next-line pickier/sort-tailwind-classes -->\n${el}`)).toHaveLength(1)
  })

  test('it covers the whole opening tag, however many lines that takes', () => {
    expect(check(`<!-- pickier-disable-next-line ${RULE_ID} -->\n<div\n  id="list"\n  class="space-y-3"\n>\n  <A />\n</div>`)).toHaveLength(0)
  })

  test('it covers only the element it precedes', () => {
    const src = `<!-- pickier-disable-next-line ${RULE_ID} -->\n${el}\n${el}`
    expect(check(src).map(issue => issue.line)).toEqual([3])
    expect(check(`<!-- pickier-disable-next-line ${RULE_ID} -->\n<p>x</p>\n${el}`)).toHaveLength(1)
  })

  test('an ordinary comment before the element changes nothing', () => {
    expect(check(`<!-- the sign-in buttons -->\n${el}`)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - options', () => {
  test('boxedComponents names the components that carry a margin themselves', () => {
    const src = '<div class="space-y-3"><StxLink to="/" /><Divider /></div>'
    expect(check(src)).toHaveLength(1)
    expect(check(src, { boxedComponents: ['StxLink', 'Divider'] })).toHaveLength(0)
  })

  test('boxedComponents replaces the default list', () => {
    const src = '<div class="space-y-3"><StxLink to="/" /></div>'
    expect(check(src, { boxedComponents: [] })).toHaveLength(1)
    expect(check(src, { boxedComponents: ['Divider'] })).toHaveLength(1)
  })

  test('anything but a list of names falls back to the default', () => {
    const src = '<div class="space-y-3"><StxLink to="/" /></div>'
    expect(check(src, {})).toHaveLength(0)
    expect(check(src, { boxedComponents: 'StxLink' })).toHaveLength(0)
    expect(check(src, null)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule wiring
// ---------------------------------------------------------------------------

describe('no-margin-spaced-components - rule', () => {
  const src = '<form class="space-y-5"><PasskeySignIn /><SocialSignIn /></form>\n'

  function tmpDir(): string {
    return mkdtempSync(join(tmpdir(), 'pickier-margin-spaced-'))
  }

  function project(files: Record<string, string>, config: Record<string, unknown> = {}): { dir: string, cfgPath: string } {
    const dir = tmpDir()
    const cfgPath = join(dir, 'cfg.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      lint: { extensions: ['.stx', '.html', '.ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      ...config,
    }), 'utf8')
    for (const [name, content] of Object.entries(files))
      writeFileSync(join(dir, name), content, 'utf8')
    return { dir, cfgPath }
  }

  async function lint(files: Record<string, string>, config: Record<string, unknown> = {}) {
    const { dir, cfgPath } = project(files, config)
    const res = await runLintProgrammatic([dir], { config: cfgPath, reporter: 'json', maxWarnings: -1 })
    return res.issues.filter(issue => issue.ruleId === RULE_ID)
  }

  test('report-only: there is no fixer', () => {
    expect(noMarginSpacedComponentsRule.fix).toBeUndefined()
    expect(pickierPlugin.rules['no-margin-spaced-components']!.fix).toBeUndefined()
  })

  test('only stx templates are checked', () => {
    const rule = pickierPlugin.rules['no-margin-spaced-components']!
    expect(rule.check(src, { ...ctx, filePath: '/test/view.stx' })).toHaveLength(1)
    expect(rule.check(src, { ...ctx, filePath: '/test/View.tsx' })).toHaveLength(0)
    expect(rule.check(src, { ...ctx, filePath: '/test/View.vue' })).toHaveLength(0)
    expect(rule.check(src, { ...ctx, filePath: '/test/page.html' })).toHaveLength(0)
    expect(rule.check(src, { ...ctx, filePath: '/test/notes.md' })).toHaveLength(0)
  })

  test('warns by default', async () => {
    const issues = await lint({ 'a.stx': src })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.severity).toBe('warning')
    expect(issues[0]!.line).toBe(1)
    expect(issues[0]!.column).toBe(7)
  })

  test('a default run leaves other file types alone', async () => {
    expect(await lint({ 'a.html': src, 'a.ts': `export const tpl = '<form class="space-y-5"><PasskeySignIn /></form>'\n` })).toHaveLength(0)
  })

  test('severity is configurable through pluginRules and rules, with or without the prefix', async () => {
    expect((await lint({ 'a.stx': src }, { pluginRules: { [RULE_ID]: 'error' } }))[0]!.severity).toBe('error')
    expect((await lint({ 'a.stx': src }, { rules: { [RULE_ID]: 'error' } }))[0]!.severity).toBe('error')
    expect((await lint({ 'a.stx': src }, { pluginRules: { 'no-margin-spaced-components': 'error' } }))[0]!.severity).toBe('error')
    expect(await lint({ 'a.stx': src }, { pluginRules: { [RULE_ID]: 'off' } })).toHaveLength(0)
    expect(await lint({ 'a.stx': src }, { rules: { [RULE_ID]: 'off' } })).toHaveLength(0)
  })

  test('options are passed with the severity', async () => {
    const withLink = '<div class="space-y-3"><StxLink to="/" /><Divider /></div>\n'
    expect(await lint({ 'a.stx': withLink })).toHaveLength(1)
    expect(await lint({ 'a.stx': withLink }, { pluginRules: { [RULE_ID]: ['warn', { boxedComponents: ['StxLink', 'Divider'] }] } })).toHaveLength(0)
    expect((await lint({ 'a.stx': withLink }, { pluginRules: { [RULE_ID]: ['error', { boxedComponents: [] }] } }))[0]!.severity).toBe('error')
  })

  test('a disable comment before the element silences it', async () => {
    expect(await lint({ 'a.stx': `<!-- pickier-disable-next-line ${RULE_ID} -->\n${src}` })).toHaveLength(0)
  })

  test('--fix leaves the template as written', async () => {
    const { dir, cfgPath } = project({ 'a.stx': src }, { pluginRules: { 'pickier/sort-tailwind-classes': 'off' } })
    await runLint([dir], { config: cfgPath, fix: true, reporter: 'json' })
    expect(readFileSync(join(dir, 'a.stx'), 'utf8')).toBe(src)
  })
})
