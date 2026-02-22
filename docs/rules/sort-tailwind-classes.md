# sort-tailwind-classes

Enforces the canonical Tailwind CSS class order across HTML, JSX, TSX, Vue, Svelte, and STX files. Matches the ordering used by `prettier-plugin-tailwindcss`.

- **Category:** Plugin (built-in, `pickier/`)
- **Default:** `off`
- **Auto-fix:** ✅

## Class Group Order

Classes are sorted into 16 groups (lower group = earlier in output):

|Group|Category|Example classes|
|-----|--------|---------------|
| 0 | Layout — display | `block`, `flex`, `grid`, `hidden`, `inline` |
| 1 | Layout — positioning | `absolute`, `relative`, `z-10`, `overflow-hidden` |
| 2 | Flexbox & Grid | `flex-col`, `gap-4`, `items-center`, `justify-between` |
| 3 | Spacing | `p-4`, `px-2`, `mt-8`, `mx-auto` |
| 4 | Sizing | `w-full`, `h-screen`, `max-w-lg` |
| 5 | Typography | `text-sm`, `font-bold`, `leading-tight`, `uppercase` |
| 6 | Backgrounds | `bg-white`, `bg-gradient-to-r`, `from-blue-500` |
| 7 | Borders | `border`, `rounded-lg`, `ring-2`, `outline-none` |
| 8 | Effects | `shadow-md`, `opacity-50` |
| 9 | Filters | `blur-sm`, `brightness-75`, `backdrop-blur` |
| 10 | Tables | `border-collapse`, `table-auto` |
| 11 | Transitions & Animation | `transition`, `duration-200`, `ease-in-out`, `animate-spin` |
| 12 | Transforms | `scale-105`, `rotate-45`, `translate-x-2` |
| 13 | Interactivity | `cursor-pointer`, `select-none`, `resize-none` |
| 14 | SVG | `fill-current`, `stroke-2` |
| 15 | Accessibility | `sr-only`, `not-sr-only` |
| 99 | Unknown | (sorted last, alphabetically) |

Within each group, classes are sorted by variant priority then alphabetically:

1. Base classes (no variant prefix)
2. Responsive variants: `sm:` → `md:` → `lg:` → `xl:` → `2xl:`
3. State variants: `hover:`, `focus:`, `dark:`, etc.

## Scanned Patterns

The rule scans the following patterns in supported files:

**HTML attributes:**

```html
class="..."
class='...'
```

**JSX / TSX attributes:**

```tsx
className="..."
className='...'
```

**Vue / Angular binding:**

```html
:class="..."
```

**Utility function calls** (first string argument):

```ts
clsx("...")
cn("...")
tw("...")
cva("...")
tv("...")
```

**Supported file extensions:** `.ts`, `.js`, `.tsx`, `.jsx`, `.mts`, `.mjs`, `.html`, `.stx`, `.vue`, `.svelte`

## Configuration

### Quick enable via `tailwind.enabled`

The simplest way to enable the rule is via the top-level `tailwind` config block. Setting `enabled: true` automatically activates the rule at `warn` severity (unless you've already configured it explicitly in `pluginRules`):

```ts
// pickier.config.ts
import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  tailwind: {
    enabled: true,
  },
}

export default config
```

### Manual enable via `pluginRules`

For explicit severity control:

```ts
pluginRules: {
  'pickier/sort-tailwind-classes': 'warn',
  // or
  'pickier/sort-tailwind-classes': 'error',
}
```

Both forms are accepted:

```ts
pluginRules: { 'sort-tailwind-classes': 'warn' }
// or
pluginRules: { 'pickier/sort-tailwind-classes': 'warn' }
```

### Full `tailwind` config options

```ts
tailwind: {
  // Enable the rule (auto-sets 'pickier/sort-tailwind-classes' to 'warn')
  enabled: true,

  // Path to tailwind.config.js/ts relative to project root (reserved for future use)
  configPath: './tailwind.config.ts',

  // Additional utility function names to scan for class strings
  callees: ['myTw', 'styles', 'classNames'],

  // Additional HTML attribute names to scan
  attributes: ['wrapperClass', 'labelClass'],
}
```

> **Note:** `callees` and `attributes` are stored in config for future use. The current implementation scans the built-in set of patterns listed above.

### JSON config

```json
{
  "tailwind": {
    "enabled": true,
    "configPath": "./tailwind.config.ts"
  }
}
```

## Examples

### HTML

```html
<!-- ❌ Bad -->
<div class="mt-4 flex text-sm bg-white p-2 rounded border">

<!-- ✅ Good -->
<div class="flex rounded border bg-white p-2 mt-4 text-sm">
```

### JSX / TSX

```tsx
// ❌ Bad
<button className="hover:bg-blue-600 text-white font-bold py-2 px-4 rounded bg-blue-500">

// ✅ Good
<button className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-600">
```

### Utility functions

```ts
// ❌ Bad
const cls = cn('mt-4 flex text-sm bg-white p-2')

// ✅ Good
const cls = cn('flex bg-white p-2 mt-4 text-sm')
```

## Auto-fix

Run with `--fix` to automatically sort classes in place:

```bash
pickier . --fix
```

The fixer rewrites class strings in-place from end to start, preserving all surrounding syntax.

## Disabling for a line

```html
<!-- pickier-disable-next-line pickier/sort-tailwind-classes -->
<div class="intentional-order foo bar baz">
```

```ts
// pickier-disable-next-line pickier/sort-tailwind-classes
const cls = cn('intentional-order foo bar baz')
```

## Best practices

- Enable via `tailwind.enabled: true` for the simplest setup
- Pair with `--fix` in pre-commit hooks to keep classes sorted automatically
- Use `clsx` or `cn` for conditional class merging — the rule scans their first string argument
- Responsive and state variants are always sorted after their base class group, so `hover:bg-blue-600` stays near `bg-blue-500`
