import type { LintIssue, RuleModule } from '../../types'

// ---------------------------------------------------------------------------
// Sibling-margin utilities around stx components
//
// stx draws a component that has reactive client code inside a wrapper element
// carrying its scope: `<div data-stx-scope="..." data-stx-component-wrapper>`.
// The document shell gives that wrapper `display: contents`, so it takes no
// box. `space-x-*`, `space-y-*`, `divide-x*` and `divide-y*` set a margin or a
// border on the parent's direct children, and here that child is the wrapper:
// the margin lands on an element with no box and is dropped, so the component
// renders flush against its neighbours.
//
// Not every component is wrapped. One with no client script, or whose script
// uses no signal or lifecycle API, is emitted as its own markup; one whose
// single root is a table or list item or a <span> carries the scope on that
// root; a deferred island (`stx-hydrate`) keeps its box. None of that is
// visible from the template that USES the component, so the rule flags every
// component child: a gap is correct whichever way the component is drawn.
//
// Report-only on purpose. `space-y-N` -> `flex flex-col gap-N` is not a
// layout-preserving rewrite: a flex column stretches children that were
// content-width (a bare button), and a row stops block children stacking.
// ---------------------------------------------------------------------------

const RULE_ID = 'pickier/no-margin-spaced-components'

/** Drawn as their own element rather than inside a component wrapper. */
const DEFAULT_BOXED_COMPONENTS: readonly string[] = ['StxLink']

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

// Scripts, styles and comments are not markup.
const NON_MARKUP_RE = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g
// An opening or closing tag; a quoted attribute value may contain `>`.
// eslint-disable-next-line regexp/no-super-linear-backtracking -- the three alternatives start on different characters
const TAG_RE = /<(\/?)([A-Z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi
// class="...", :class="...", x-class="...", x-bind:class="..." (either quote)
const CLASS_ATTR_RE = /(?:^|\s)((?::|x-bind:|x-)?class)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const QUICK_RE = /(?:space|divide)-[xy]/
// The engine reads `//` and `#` directives, and neither can be written in
// markup, so the comment form is read here.
const DISABLE_COMMENT_RE = /<!--\s*(?:eslint|pickier)-disable-next-line(?:\s+([^\s-][^\n]*?))?\s*-->\s*$/

export interface NoMarginSpacedComponentsOptions {
  /**
   * Component tags drawn as their own element, which carry a sibling margin
   * like any other element. Replaces the default (`['StxLink']`).
   */
  boxedComponents?: string[]
}

interface SpacingUtility {
  /** The class as written, e.g. `md:space-y-5` */
  token: string
  kind: 'space' | 'divide'
  /** The gap classes that replace it, when there are any */
  gap?: string
}

interface OpenElement {
  tag: string
  /** Offset of the opening `<` */
  start: number
  /** Offset of the class attribute holding the first spacing utility */
  offset: number
  spacing: SpacingUtility[]
  components: string[]
}

export interface MarginSpacedParent {
  tag: string
  /** Offset of the class attribute holding the first spacing utility */
  offset: number
  spacing: SpacingUtility[]
  components: string[]
}

/** Split `md:hover:space-y-5` into its variant prefix (`md:hover:`) and base, ignoring `:` inside `[...]`. */
function splitVariants(token: string): [string, string] {
  let depth = 0
  let cut = 0
  for (let i = 0; i < token.length; i++) {
    const ch = token[i]
    if (ch === '[')
      depth++
    else if (ch === ']')
      depth = Math.max(0, depth - 1)
    else if (ch === ':' && depth === 0)
      cut = i + 1
  }
  return [token.slice(0, cut), token.slice(cut)]
}

function parseSpacingUtility(token: string): SpacingUtility | null {
  const [variants, rawBase] = splitVariants(token)
  // `!space-y-4` (v3) and `space-y-4!` (v4) are the important modifier
  const important = rawBase.startsWith('!') || rawBase.endsWith('!')
  let base = rawBase.replace(/^!/, '').replace(/!$/, '')
  const negative = base.startsWith('-')
  if (negative)
    base = base.slice(1)

  const space = base.match(/^space-([xy])-(.+)$/)
  if (space) {
    const [, axis, value] = space
    // `space-y-reverse` only modifies a `space-y-N` that is reported itself
    if (value === 'reverse')
      return null
    // A negative margin overlaps siblings; a gap cannot be negative
    if (negative)
      return { token, kind: 'space' }
    const mark = important ? '!' : ''
    const names = axis === 'y' ? ['flex', 'flex-col', `gap-${value}`] : ['flex', `gap-${value}`]
    return { token, kind: 'space', gap: names.map(name => `${variants}${mark}${name}`).join(' ') }
  }

  const divide = base.match(/^divide-[xy](?:-(.+))?$/)
  if (divide)
    return divide[1] === 'reverse' ? null : { token, kind: 'divide' }

  return null
}

/**
 * The class names in an attribute value. A bound value (`:class`) is an
 * expression, so its string literals are read as class lists too.
 */
function classTokens(value: string, bound: boolean): string[] {
  return value.split(bound ? /[\s'"`,{}()]+/ : /\s+/).filter(Boolean)
}

/** Is the element at `start` preceded by a comment that disables this rule for it? */
function disabledByComment(source: string, start: number): boolean {
  const comment = source.slice(0, start).match(DISABLE_COMMENT_RE)
  if (!comment)
    return false
  // No rule named disables every rule
  const rules = (comment[1] ?? '').replace(/\s+--\s.*$/, '').split(',').map(name => name.trim()).filter(Boolean)
  return rules.length === 0 || rules.includes(RULE_ID) || rules.includes(RULE_ID.slice(RULE_ID.indexOf('/') + 1))
}

/**
 * Elements spaced by sibling margins or borders that have a component among
 * their DIRECT children. A component further down has its own parent to
 * answer for it.
 */
export function findMarginSpacedParents(source: string, boxedComponents: readonly string[] = DEFAULT_BOXED_COMPONENTS): MarginSpacedParent[] {
  if (!QUICK_RE.test(source))
    return []

  // Blanked rather than removed, so offsets and line numbers hold
  const markup = source.replace(NON_MARKUP_RE, block => block.replace(/[^\n]/g, ' '))
  const boxed = new Set(boxedComponents)
  const open: OpenElement[] = []
  const found: MarginSpacedParent[] = []

  const close = (el: OpenElement): void => {
    if (el.spacing.length > 0 && el.components.length > 0 && !disabledByComment(source, el.start))
      found.push({ tag: el.tag, offset: el.offset, spacing: el.spacing, components: [...new Set(el.components)] })
  }

  TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_RE.exec(markup)) !== null) {
    const closing = match[1] === '/'
    const tag = match[2]!
    const attributes = match[3] ?? ''

    if (closing) {
      // A closing tag with nothing open to match is stray: leave the stack be
      let at = open.length - 1
      while (at >= 0 && open[at]!.tag !== tag)
        at--
      if (at === -1)
        continue
      // Whatever was left open inside it (a <p> or <li> without its closing
      // tag) ends here too
      while (open.length > at)
        close(open.pop()!)
      continue
    }

    const parent = open[open.length - 1]
    if (parent && /^[A-Z]/.test(tag) && !boxed.has(tag))
      parent.components.push(tag)

    if (/\/\s*$/.test(attributes) || VOID_TAGS.has(tag.toLowerCase()))
      continue

    const attributesStart = match.index + 1 + tag.length
    const spacing: SpacingUtility[] = []
    let offset = match.index
    CLASS_ATTR_RE.lastIndex = 0
    let attr: RegExpExecArray | null
    while ((attr = CLASS_ATTR_RE.exec(attributes)) !== null) {
      const name = attr[1]!
      const utilities = classTokens(attr[2] ?? attr[3] ?? '', name !== 'class')
        .map(parseSpacingUtility)
        .filter((utility): utility is SpacingUtility => utility !== null)
      if (utilities.length > 0 && spacing.length === 0)
        offset = attributesStart + attr.index + attr[0].indexOf(name)
      for (const utility of utilities) {
        if (!spacing.some(seen => seen.token === utility.token))
          spacing.push(utility)
      }
    }
    open.push({ tag, start: match.index, offset, spacing, components: [] })
  }

  // Never closed: still a parent of what followed
  while (open.length > 0)
    close(open.pop()!)

  return found.sort((a, b) => a.offset - b.offset)
}

function list(items: string[]): string {
  if (items.length < 3)
    return items.join(' and ')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function describe(parent: MarginSpacedParent): string {
  const kinds = new Set(parent.spacing.map(utility => utility.kind))
  const what = kinds.size === 2 ? 'margins and borders' : kinds.has('space') ? 'a margin' : 'a border'
  const advice = parent.spacing.map((utility) => {
    if (utility.gap)
      return `Use "${utility.gap}" instead of ${utility.token}.`
    if (utility.kind === 'divide')
      return `${utility.token} has no gap equivalent: draw the border on the items themselves, or wrap each component in an element.`
    return `${utility.token} has no gap equivalent: wrap each component in an element that carries the margin.`
  })
  return `${list(parent.spacing.map(utility => utility.token))} puts ${what} between siblings, which never reaches ${list(parent.components.map(name => `<${name}>`))}: stx can draw a component inside a wrapper with display: contents, which takes no box. ${advice.join(' ')}`
}

function boxedComponentsFrom(options: unknown): readonly string[] {
  const boxed = (options as NoMarginSpacedComponentsOptions | undefined)?.boxedComponents
  return Array.isArray(boxed) ? boxed.filter(name => typeof name === 'string') : DEFAULT_BOXED_COMPONENTS
}

export const noMarginSpacedComponentsRule: RuleModule = {
  meta: {
    docs: 'Disallow space-x/space-y/divide-x/divide-y on an element whose direct children include an stx component.',
    recommended: true,
  },

  check: (content, ctx) => {
    const issues: LintIssue[] = []

    for (const parent of findMarginSpacedParents(content, boxedComponentsFrom(ctx.options))) {
      const before = content.slice(0, parent.offset)
      const line = (before.match(/\n/g) ?? []).length + 1
      const lastNl = before.lastIndexOf('\n')
      const column = lastNl === -1 ? parent.offset + 1 : parent.offset - lastNl

      issues.push({
        filePath: ctx.filePath,
        line,
        column,
        ruleId: RULE_ID,
        message: describe(parent),
        severity: 'warning',
        help: 'Only a component with reactive client code gets the wrapper, which this template cannot tell, and a gap is right either way. In a flex column children stretch to the full width: add self-start to one that should keep its own width. A component that is always drawn as its own element can be listed in the boxedComponents option.',
      })
    }

    return issues
  },
}
