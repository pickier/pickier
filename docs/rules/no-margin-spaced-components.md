# no-margin-spaced-components

Disallows `space-x-*`, `space-y-*`, `divide-x*` and `divide-y*` on an element whose direct children include an stx component. Those utilities space siblings with a margin or a border, and stx can draw a component inside a wrapper that takes no box, so the spacing never reaches what the component draws.

- **Category:** Plugin (built-in, `pickier/`)
- **Default:** `warn`
- **Auto-fix:** ❌ (report-only, see [Why there is no auto-fix](#why-there-is-no-auto-fix))
- **Files:** `.stx` only

## The bug it catches

```html
<form class="space-y-5">
  <PasskeySignIn />
  <SocialSignIn />
</form>
```

The two components render touching. stx emits each of them as:

```html
<div data-stx-scope="..." data-stx-component-wrapper>
  <!-- what the component draws -->
</div>
```

and the document shell ships `[data-stx-component-wrapper]:not([stx-hydrate]) { display: contents }`. An element with `display: contents` generates no box. `space-y-5` compiles to a margin on the parent's direct children (`> :not([hidden]) ~ :not([hidden])`), and the direct child here is the wrapper: the margin lands on an element with no box and is dropped. `divide-*` sets a border the same way, and a border on an element with no box is not drawn.

A `gap` is unaffected, because flex and grid items are the wrapper's children:

```html
<form class="flex flex-col gap-5">
  <PasskeySignIn />
  <SocialSignIn />
</form>
```

## Which components get the wrapper

Not all of them. In stx (`packages/stx/src/utils.ts`, `renderComponentWithSlot`), a component is wrapped when it has a client script and any of these holds:

- the script calls a signal or lifecycle API (`state`, `derived`, `effect`, `ref`, `reactive`, `computed`, `watch`, `onMount`, `onDestroy`, `defineProps`, `defineEmits`, `useReactiveProp`, ...)
- its template uses `x-data`
- the caller passes an event handler (`@click`, `x-on:`) in its slot content
- the page is rendered for a native host

and it is not wrapped, or the wrapper keeps a box, when:

- it has no client script, or a script with none of the above: its markup is emitted as is
- its output is a single `<tr>`, `<td>`, `<th>`, `<thead>`, `<tbody>`, `<tfoot>`, `<caption>`, `<colgroup>`, `<col>`, `<option>`, `<optgroup>`, `<li>`, `<dt>`, `<dd>` or `<span>`: the scope goes on that root element
- it is a deferred island (`stx-hydrate`): the wrapper keeps its box
- it is a built-in that stx renders straight to HTML, such as `<StxLink>`, which becomes its own `<a>`

None of this can be read from the template that uses the component: it depends on the component's own file, and changes the day someone adds a `state()` to it. So the rule flags every component child and says why in its message. A gap is correct whichever way the component is drawn.

## What is reported

An element is reported when:

1. its `class`, `:class`, `x-class` or `x-bind:class` holds a `space-x-*`, `space-y-*`, `divide-x*` or `divide-y*` class, with any variant prefixes (`md:`, `dark:`, `max-md:`, `[&>*]:`); in a bound class the string literals of the expression are read
2. one of its **direct** children is a component, meaning a tag that starts with an uppercase letter

A component further down is not counted: it has its own parent to answer for it. Markup inside `<script>`, `<style>` and comments is ignored. `space-x-reverse`, `space-y-reverse`, `divide-x-reverse` and `divide-y-reverse` are not reported on their own, since they only modify another utility.

The issue is placed on the class attribute that holds the utility, and names the utility, the components and the replacement:

```text
space-y-5 puts a margin between siblings, which never reaches <PasskeySignIn> and <SocialSignIn>:
stx can draw a component inside a wrapper with display: contents, which takes no box.
Use "flex flex-col gap-5" instead of space-y-5.
```

|Written|Suggested|
|-------|---------|
| `space-y-5` | `flex flex-col gap-5` |
| `space-x-2` | `flex gap-2` |
| `md:space-y-5` | `md:flex md:flex-col md:gap-5` |
| `-space-x-2` | none: wrap each component in an element that carries the margin |
| `divide-y`, `divide-x-2` | none: draw the border on the items themselves, or wrap each component in an element |

## Examples

```html
<!-- ❌ Bad -->
<div class="space-y-3">
  <p>Loading</p>
  <Skeleton class="h-20" />
</div>

<ul class="divide-y">
  <Row />
  <Row />
</ul>

<!-- ✅ Good -->
<div class="flex flex-col gap-3">
  <p>Loading</p>
  <Skeleton class="h-20" />
</div>

<!-- ✅ Good: no component among the direct children -->
<div class="space-y-3">
  <p>Loading</p>
  <section><Skeleton class="h-20" /></section>
</div>

<!-- ✅ Good: StxLink is drawn as its own anchor -->
<nav class="space-x-4">
  <StxLink to="/">Home</StxLink>
  <StxLink to="/about">About</StxLink>
</nav>
```

## Configuration

The rule is on at `warn` by default. Change the severity like any other rule:

```ts
// pickier.config.ts
import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  pluginRules: {
    'pickier/no-margin-spaced-components': 'error',
    // or
    'pickier/no-margin-spaced-components': 'off',
  },
}

export default config
```

Both forms are accepted:

```ts
pluginRules: { 'no-margin-spaced-components': 'warn' }
// or
pluginRules: { 'pickier/no-margin-spaced-components': 'warn' }
```

### Options

|Option|Type|Default|Description|
|------|----|-------|-----------|
| `boxedComponents` | `string[]` | `['StxLink']` | Component tags that are always drawn as their own element and so carry a sibling margin like any other element. Replaces the default list, so keep `StxLink` in it. |

```ts
pluginRules: {
  'pickier/no-margin-spaced-components': ['warn', {
    boxedComponents: ['StxLink', 'Divider'],
  }],
}
```

Only list a component here when its file has no client script and is going to stay that way.

## Why there is no auto-fix

`space-y-N` to `flex flex-col gap-N` is the right change, but it is not a layout-preserving one, so `--fix` does not make it:

- a flex column stretches its children to the full width. A bare `<button>` or a badge that was as wide as its content becomes a full-width bar until it is given `self-start`.
- `space-x-N` to `flex gap-N` turns block children that were stacked into a row, and stops inline children wrapping.
- margins between flex items do not collapse, so children with their own vertical margins move.
- a display utility set elsewhere (a `:class` expression, an `@apply` in a stylesheet) is invisible to the fixer.

Each of these is a visible change that a fixer would make silently. Apply the suggested classes by hand and look at the result; the usual follow-up is `self-start` on a child that should keep its own width.

## Disabling for an element

A comment directly before the element disables the rule for it, however many lines its opening tag takes:

```html
<!-- pickier-disable-next-line pickier/no-margin-spaced-components -->
<div class="space-y-3">
  <StaticNote />
</div>
```

## Best practices

- Space the children of any element that holds a component with `gap`, not with sibling margins
- Reach for `flex flex-col gap-N` first; add `self-start` (or `items-start` on the parent) where a child should not stretch
- Prefer fixing the parent over listing a component in `boxedComponents`: the gap keeps working when the component later gains client state
