import type { RuleModule } from '../../types'

// ---------------------------------------------------------------------------
// Tailwind CSS class ordering
//
// Enforces the canonical Tailwind class order used by prettier-plugin-tailwindcss
// and eslint-plugin-tailwindcss. Classes are grouped by category and sorted
// within each group alphabetically.
//
// Supported attribute patterns (HTML / JSX / Vue / STX):
//   class="..."          className="..."        :class="..."
//   class={`...`}        className={`...`}
//   clsx(...)            cn(...)                tw(...)
//   cva(...)             tv(...)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tailwind class ordering — canonical group order
// Each entry is a prefix (or exact match) that maps to a sort-group index.
// Groups follow the official Tailwind docs order:
//   Layout → Flexbox/Grid → Spacing → Sizing → Typography → Backgrounds →
//   Borders → Effects → Filters → Tables → Transitions → Transforms →
//   Interactivity → SVG → Accessibility → Variants (responsive/state)
// ---------------------------------------------------------------------------

const GROUP_ORDER: Array<[RegExp, number]> = [
  // ── Variants / responsive prefixes (always last within their class) ──────
  // handled separately via prefix stripping

  // ── Layout ───────────────────────────────────────────────────────────────
  [/^(block|inline|inline-block|flex|inline-flex|grid|inline-grid|flow-root|contents|hidden|table|table-caption|table-cell|table-column|table-column-group|table-footer-group|table-header-group|table-row-group|table-row|list-item|subgrid)$/, 0],
  [/^(container|columns|break-after|break-before|break-inside|box-decoration|box-border|box-content|float|clear|isolation|object|overflow|overscroll|position|inset|top|right|bottom|left|start|end|z-|aspect|order)/, 1],
  [/^(static|fixed|absolute|relative|sticky)$/, 1],
  [/^(visible|invisible|collapse)$/, 1],

  // ── Flexbox & Grid ────────────────────────────────────────────────────────
  [/^(basis|flex-|grow|shrink|order|grid-|col-|row-|auto-cols|auto-rows|gap|justify|items|content|self|place)/, 2],

  // ── Spacing ───────────────────────────────────────────────────────────────
  [/^(p|px|py|ps|pe|pt|pr|pb|pl|m|mx|my|ms|me|mt|mr|mb|ml|space|indent)-/, 3],
  [/^(-?(p|px|py|ps|pe|pt|pr|pb|pl|m|mx|my|ms|me|mt|mr|mb|ml|space|indent)-)/, 3],

  // ── Sizing ────────────────────────────────────────────────────────────────
  [/^(w-|h-|min-w|max-w|min-h|max-h|size-)/, 4],

  // ── Typography ────────────────────────────────────────────────────────────
  [/^(font|text|tracking|leading|list|placeholder|vertical|whitespace|break|hyphens|content|truncate|overflow-ellipsis|overflow-clip|line-clamp|underline|overline|line-through|no-underline|uppercase|lowercase|capitalize|normal-case|italic|not-italic|ordinal|slashed-zero|lining-nums|oldstyle-nums|proportional-nums|tabular-nums|diagonal-fractions|stacked-fractions|normal-nums|antialiased|subpixel-antialiased)/, 5],

  // ── Backgrounds ───────────────────────────────────────────────────────────
  [/^(bg-|from-|via-|to-|gradient-)/, 6],

  // ── Borders ───────────────────────────────────────────────────────────────
  [/^(border|rounded|outline|ring|divide|accent)/, 7],

  // ── Effects ───────────────────────────────────────────────────────────────
  [/^(shadow|opacity|mix-blend|bg-blend)/, 8],

  // ── Filters ───────────────────────────────────────────────────────────────
  [/^(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|backdrop)/, 9],

  // ── Tables ────────────────────────────────────────────────────────────────
  [/^(border-collapse|border-separate|border-spacing|table-auto|table-fixed|caption)/, 10],

  // ── Transitions & Animation ───────────────────────────────────────────────
  [/^(transition|duration|ease|delay|animate)/, 11],

  // ── Transforms ────────────────────────────────────────────────────────────
  [/^(scale|rotate|translate|skew|origin|transform|perspective)/, 12],

  // ── Interactivity ────────────────────────────────────────────────────────
  [/^(appearance|cursor|caret|pointer-events|resize|scroll|snap|touch|select|will-change)/, 13],

  // ── SVG ───────────────────────────────────────────────────────────────────
  [/^(fill|stroke)/, 14],

  // ── Accessibility ─────────────────────────────────────────────────────────
  [/^(sr-only|not-sr-only)$/, 15],
]

// Matches variant prefixes that appear BEFORE any [...] bracket.
// e.g. "hover:", "md:", "dark:hover:" — but NOT "[mask-type:alpha]".
const VARIANT_RE = /^((?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*):)+(?!\[)/

// Strips leading variant prefixes safely (won't eat into arbitrary properties).
function stripVariants(cls: string): string {
  // Walk colon-separated segments; stop as soon as we hit a segment starting with '['
  let i = 0
  while (i < cls.length) {
    if (cls[i] === '[') break
    const colon = cls.indexOf(':', i)
    if (colon === -1) break
    // The segment after the colon must not start with '[' (arbitrary property)
    if (cls[colon + 1] === '[') break
    i = colon + 1
  }
  return cls.slice(i)
}

function getGroupIndex(cls: string): number {
  // Strip variant prefixes (hover:, md:, dark:, focus:, etc.)
  // Also strip leading ! important modifier
  let base = stripVariants(cls)
  if (base.startsWith('!')) base = base.slice(1)
  for (const [re, idx] of GROUP_ORDER) {
    if (re.test(base))
      return idx
  }
  return 99 // unknown — sort last
}

function getVariantPriority(cls: string): number {
  const match = cls.match(VARIANT_RE)
  if (!match)
    return 0
  const variants = match[0].slice(0, -1).split(':')
  // Responsive variants get higher priority (sort after base classes)
  const responsiveOrder: Record<string, number> = {
    sm: 1, md: 2, lg: 3, xl: 4, '2xl': 5,
  }
  let priority = 10
  for (const v of variants) {
    if (responsiveOrder[v] !== undefined)
      priority += responsiveOrder[v]
    else
      priority += 20 // state variants (hover, focus, dark, etc.)
  }
  return priority
}

function sortClasses(classes: string[]): string[] {
  return [...classes].sort((a, b) => {
    const ga = getGroupIndex(a)
    const gb = getGroupIndex(b)
    if (ga !== gb)
      return ga - gb
    const va = getVariantPriority(a)
    const vb = getVariantPriority(b)
    if (va !== vb)
      return va - vb
    return a.localeCompare(b)
  })
}

// ---------------------------------------------------------------------------
// Attribute value extraction helpers
// ---------------------------------------------------------------------------

// Matches: class="...", className="...", :class="..."
// Also: class='...', className='...'
const ATTR_RE = /\b(?:class|className|:class)\s*=\s*(?:"([^"]*?)"|'([^']*?)')/g

// Matches template literal class strings: class={`...`}, className={`...`}
const ATTR_TMPL_RE = /\b(?:class|className|:class)\s*=\s*\{`([^`]*?)`\}/g

// Matches utility function calls: clsx("..."), cn("..."), tw("..."), cva("..."), tv("...")
const UTIL_FN_RE = /\b(?:clsx|cn|tw|cva|tv)\s*\(\s*(?:"([^"]*?)"|'([^']*?)')/g

interface ClassMatch {
  value: string
  start: number
  end: number
}

function extractClassValues(content: string): ClassMatch[] {
  const matches: ClassMatch[] = []

  for (const re of [ATTR_RE, ATTR_TMPL_RE, UTIL_FN_RE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const value = m[1] ?? m[2] ?? ''
      if (!value.trim())
        continue
      const valueStart = content.indexOf(value, m.index)
      if (valueStart === -1)
        continue
      matches.push({ value, start: valueStart, end: valueStart + value.length })
    }
  }

  // Sort by position so we process them in order
  matches.sort((a, b) => a.start - b.start)
  return matches
}

function parseClasses(value: string): string[] {
  // Split on whitespace but NOT inside [...] brackets (arbitrary values may
  // contain spaces when written as e.g. bg-[url('a b')] — rare but valid).
  const classes: string[] = []
  let current = ''
  let depth = 0
  for (const ch of value) {
    if (ch === '[') {
      depth++
      current += ch
    }
    else if (ch === ']') {
      depth = Math.max(0, depth - 1)
      current += ch
    }
    else if (/\s/.test(ch) && depth === 0) {
      if (current) {
        classes.push(current)
        current = ''
      }
    }
    else {
      current += ch
    }
  }
  if (current) classes.push(current)
  return classes
}

function isSorted(classes: string[]): boolean {
  const sorted = sortClasses(classes)
  return classes.every((c, i) => c === sorted[i])
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

export const sortTailwindClassesRule: RuleModule = {
  meta: {
    docs: 'Enforce consistent Tailwind CSS class ordering (layout → spacing → typography → etc.).',
    recommended: true,
  },

  check: (content, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const matches = extractClassValues(content)

    for (const { value, start } of matches) {
      const classes = parseClasses(value)
      if (classes.length < 2)
        continue
      if (!isSorted(classes)) {
        // Calculate line/column from start offset
        const before = content.slice(0, start)
        const line = (before.match(/\n/g) ?? []).length + 1
        const lastNl = before.lastIndexOf('\n')
        const column = lastNl === -1 ? start + 1 : start - lastNl

        issues.push({
          filePath: ctx.filePath,
          line,
          column,
          ruleId: 'pickier/sort-tailwind-classes',
          message: `Tailwind classes are not in the recommended order. Expected: "${sortClasses(classes).join(' ')}"`,
          severity: 'warning',
          help: 'Run with --fix to automatically sort Tailwind classes, or reorder them manually.',
        })
      }
    }

    return issues
  },

  fix: (content) => {
    const matches = extractClassValues(content)
    if (matches.length === 0)
      return content

    // Apply replacements from end to start to preserve offsets
    const sorted = [...matches].reverse()
    let result = content

    for (const { value, start, end } of sorted) {
      const classes = parseClasses(value)
      if (classes.length < 2 || isSorted(classes))
        continue
      const sortedValue = sortClasses(classes).join(' ')
      result = result.slice(0, start) + sortedValue + result.slice(end)
    }

    return result
  },
}
