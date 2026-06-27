/* eslint-disable no-console */
import type { LintOptions, RuleContext } from '../../../src/types'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { blanksAroundListsRule } from '../../../src/rules/markdown/blanks-around-lists'
import { emphasisStyleRule } from '../../../src/rules/markdown/emphasis-style'
import { noSpaceInEmphasisRule } from '../../../src/rules/markdown/no-space-in-emphasis'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const ctx = (options?: unknown): RuleContext => ({ filePath: 'test.md', config: {} as any, options })

// These tests pin the three autofix corruptions found when `pickier . --fix`
// mangled rpx's bench/README.md:
//   1. MD037 stripped the space in `**caddy** and **nginx**`
//   2. MD049 rewrote `_` → `*` inside `` `reverse_proxy` `` / `` `proxy_pass` ``
//   3. MD032 split list items from their indented continuation lines.

// ─── MD037: no-space-in-emphasis ─────────────────────────────────────────────

describe('MD037 no-space-in-emphasis — adjacent spans & code', () => {
  const fix = (s: string) => noSpaceInEmphasisRule.fix!(s, ctx())
  const check = (s: string) => noSpaceInEmphasisRule.check(s, ctx())

  it('does NOT touch two adjacent bold spans separated by a word', () => {
    const input = '— **caddy** and **nginx** —'
    expect(fix(input)).toBe(input)
    expect(check(input)).toHaveLength(0)
  })

  it('does NOT touch two adjacent underscore-strong spans', () => {
    const input = '__one__ and __two__'
    expect(fix(input)).toBe(input)
    expect(check(input)).toHaveLength(0)
  })

  it('does NOT touch three adjacent bold spans', () => {
    const input = '**a** **b** **c**'
    expect(fix(input)).toBe(input)
    expect(check(input)).toHaveLength(0)
  })

  it('does NOT touch emphasis markers inside inline code', () => {
    const input = 'Use `** not emphasis **` here'
    expect(fix(input)).toBe(input)
    expect(check(input)).toHaveLength(0)
  })

  it('still fixes a genuine space after the opening **', () => {
    expect(fix('** bold**')).toBe('**bold**')
    expect(check('** bold**').length).toBeGreaterThan(0)
  })

  it('still fixes a genuine space before the closing **', () => {
    expect(fix('**bold **')).toBe('**bold**')
    expect(check('**bold **').length).toBeGreaterThan(0)
  })

  it('still fixes spaces on both sides', () => {
    expect(fix('** bold **')).toBe('**bold**')
  })

  it('still fixes genuine __ violations', () => {
    expect(fix('__ bold__')).toBe('__bold__')
    expect(fix('__bold __')).toBe('__bold__')
  })

  it('fixes a real violation while leaving an adjacent-span pair alone', () => {
    expect(fix('** bad ** and **good** vs **also**'))
      .toBe('**bad** and **good** vs **also**')
  })

  it('handles emphasis wrapped in punctuation', () => {
    expect(fix('(** bold **)')).toBe('(**bold**)')
  })

  it('leaves clean bold untouched', () => {
    const input = '**clean** and **tidy**'
    expect(fix(input)).toBe(input)
  })

  it('skips fenced code blocks entirely', () => {
    const input = '```\n** not emphasis **\n```\n'
    expect(fix(input)).toBe(input)
  })

  it('fixes a real violation but not a literal in code on the same line', () => {
    expect(fix('** bad ** but `** literal **` stays'))
      .toBe('**bad** but `** literal **` stays')
  })
})

// ─── MD049: emphasis-style ───────────────────────────────────────────────────

describe('MD049 emphasis-style — code spans & cross-line pairing', () => {
  it('does NOT pair a lone _ in one code span with a lone _ a line later', () => {
    const input = '| `caddy` | `caddy reverse_proxy`. |\n| `nginx` | `nginx proxy_pass`. |\n'
    expect(emphasisStyleRule.fix!(input, ctx({ style: 'asterisk' }))).toBe(input)
  })

  it('does NOT convert underscores inside a single inline code span', () => {
    const input = 'run `a_b_c` then done'
    expect(emphasisStyleRule.fix!(input, ctx({ style: 'asterisk' }))).toBe(input)
  })

  it('converts real underscore emphasis to asterisk', () => {
    expect(emphasisStyleRule.fix!('this is _emphasised_ text', ctx({ style: 'asterisk' })))
      .toBe('this is *emphasised* text')
  })

  it('converts real asterisk emphasis to underscore', () => {
    expect(emphasisStyleRule.fix!('this is *emphasised* text', ctx({ style: 'underscore' })))
      .toBe('this is _emphasised_ text')
  })

  it('converts emphasis in prose but leaves a code-span underscore alone on the same line', () => {
    expect(emphasisStyleRule.fix!('_real_ but `keep_this`', ctx({ style: 'asterisk' })))
      .toBe('*real* but `keep_this`')
  })

  it('does not touch markers inside fenced code blocks', () => {
    const input = '```ts\nconst _x = 1\n```\nand _real_ here\n'
    expect(emphasisStyleRule.fix!(input, ctx({ style: 'asterisk' })))
      .toBe('```ts\nconst _x = 1\n```\nand *real* here\n')
  })

  it('consistent style: a code-span underscore does not decide the document style', () => {
    // First real emphasis is the asterisk on line 2 — underscore in code is ignored.
    const input = '`keep_me`\n*first* and _second_\n'
    expect(emphasisStyleRule.fix!(input, ctx({ style: 'consistent' })))
      .toBe('`keep_me`\n*first* and *second*\n')
  })

  it('leaves text without single-marker emphasis unchanged', () => {
    const input = 'just **strong** and `code`, nothing else'
    expect(emphasisStyleRule.fix!(input, ctx({ style: 'asterisk' }))).toBe(input)
  })

  it('handles multiple emphasis markers on one line', () => {
    expect(emphasisStyleRule.fix!('_a_ _b_ _c_', ctx({ style: 'asterisk' })))
      .toBe('*a* *b* *c*')
  })
})

// ─── MD032: blanks-around-lists ──────────────────────────────────────────────

describe('MD032 blanks-around-lists — continuation lines', () => {
  const fix = (s: string) => blanksAroundListsRule.fix!(s, ctx())

  it('does NOT insert a blank between an item and its indented continuation', () => {
    const input = 'Intro\n- Item one\n  continues here\n- Item two\nAfter\n'
    expect(fix(input)).toBe('Intro\n\n- Item one\n  continues here\n- Item two\n\nAfter\n')
  })

  it('keeps multi-paragraph list continuations attached', () => {
    const input = '- First\n  line two\n  line three\n- Second\n'
    // No surrounding prose → no blanks needed; continuations stay put.
    expect(fix(input)).toBe(input)
  })

  it('handles ordered lists with continuations', () => {
    const input = 'Lead\n1. One\n   wrapped\n2. Two\nEnd\n'
    expect(fix(input)).toBe('Lead\n\n1. One\n   wrapped\n2. Two\n\nEnd\n')
  })

  it('still adds a blank line before a list', () => {
    expect(fix('Some text\n- a\n- b\n')).toContain('Some text\n\n- a')
  })

  it('still adds a blank line after a list', () => {
    expect(fix('- a\n- b\nText\n')).toContain('- b\n\nText')
  })

  it('does not add a leading blank for a list at the start of the file', () => {
    expect(fix('- a\n- b\n\nText\n').startsWith('\n')).toBe(false)
  })

  it('does not split items inside a properly spaced list', () => {
    const input = '\n- a\n- b\n- c\n\n'
    expect(fix(input)).toBe(input)
  })

  it('leaves list markers inside fenced code blocks alone', () => {
    const input = 'Text\n\n```\n- not a list\n- still code\n```\n\nMore\n'
    expect(fix(input)).toBe(input)
  })

  it('is idempotent — a second pass changes nothing', () => {
    const once = fix('Intro\n- a\n  cont\n- b\nAfter\n')
    expect(fix(once)).toBe(once)
  })
})

// ─── End-to-end: the rpx README shape through `pickier --fix` ─────────────────

describe('rpx bench README shape is stable under --fix', () => {
  it('leaves the prose + list + table intact (no corruption)', async () => {
    const content = `# rpx benchmarks

A reproducible benchmark suite comparing rpx's reverse-proxy hot path against
the most popular reverse proxies — **caddy** and **nginx** — plus a raw
\`Bun.serve\` proxy and a direct-to-origin baseline.

- **Latency** is measured with [mitata](https://github.com/evanwashere/mitata)
  (single in-flight request → how much latency each proxy adds).
- **Throughput** is measured with [\`oha\`](https://github.com/hatoo/oha) under
  real concurrency (requests/sec), falling back to a built-in driver
  if \`oha\` isn't installed.

| Target    | What it is                          |
|-----------|-------------------------------------|
| \`caddy\`   | \`caddy reverse_proxy\`.              |
| \`nginx\`   | \`nginx proxy_pass\` with keepalive.  |
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({
      'markdown/no-space-in-emphasis': 'error',
      'markdown/emphasis-style': ['error', { style: 'consistent' }],
      'markdown/strong-style': ['error', { style: 'consistent' }],
      'markdown/blanks-around-lists': 'error',
    })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    const originalLog = console.log
    console.log = () => {}
    try {
      await runLint([tempPath], options)
    }
    finally {
      console.log = originalLog
    }

    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toContain('**caddy** and **nginx**')
    expect(fixed).toContain('`caddy reverse_proxy`')
    expect(fixed).toContain('`nginx proxy_pass`')
    expect(fixed).not.toContain('reverse*proxy')
    expect(fixed).not.toContain('caddy**and**nginx')
    // List continuations stay glued to their items (no injected blank line).
    expect(fixed).toContain('mitata)\n  (single in-flight')
  })
})
