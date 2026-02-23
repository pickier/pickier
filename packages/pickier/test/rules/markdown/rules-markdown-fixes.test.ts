/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── no-multiple-space-blockquote fix ────────────────────────────────────────

describe('MD027 - no-multiple-space-blockquote fix', () => {
  it('fix: reduces multiple spaces to single space', async () => {
    const { noMultipleSpaceBlockquoteRule } = await import('../../../src/rules/markdown/no-multiple-space-blockquote')
    const fixed = noMultipleSpaceBlockquoteRule.fix!('>  Multiple spaces\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('> Multiple spaces\n')
  })

  it('fix: does not modify single space blockquotes', async () => {
    const { noMultipleSpaceBlockquoteRule } = await import('../../../src/rules/markdown/no-multiple-space-blockquote')
    const input = '> Single space\n'
    const fixed = noMultipleSpaceBlockquoteRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })

  it('fix: handles nested blockquotes', async () => {
    const { noMultipleSpaceBlockquoteRule } = await import('../../../src/rules/markdown/no-multiple-space-blockquote')
    const fixed = noMultipleSpaceBlockquoteRule.fix!('>>  Nested\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('>> Nested\n')
  })
})

// ─── blanks-around-fences fix ────────────────────────────────────────────────

describe('MD031 - blanks-around-fences fix', () => {
  it('fix: adds blank line before fence', async () => {
    const { blanksAroundFencesRule } = await import('../../../src/rules/markdown/blanks-around-fences')
    const input = 'Some text\n```js\ncode\n```\n'
    const fixed = blanksAroundFencesRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('\n\n```js')
  })

  it('fix: adds blank line after fence', async () => {
    const { blanksAroundFencesRule } = await import('../../../src/rules/markdown/blanks-around-fences')
    const input = '```js\ncode\n```\nSome text\n'
    const fixed = blanksAroundFencesRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('```\n\nSome text')
  })

  it('fix: does not add blank before fence at start of file', async () => {
    const { blanksAroundFencesRule } = await import('../../../src/rules/markdown/blanks-around-fences')
    const input = '```js\ncode\n```\n\nSome text\n'
    const fixed = blanksAroundFencesRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed.startsWith('\n')).toBe(false)
  })

  it('fix: allows container directives adjacent to fences', async () => {
    const { blanksAroundFencesRule } = await import('../../../src/rules/markdown/blanks-around-fences')
    const input = ':::tip\n```js\ncode\n```\n:::\n'
    const fixed = blanksAroundFencesRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── blanks-around-lists fix ─────────────────────────────────────────────────

describe('MD032 - blanks-around-lists fix', () => {
  it('fix: adds blank line before list', async () => {
    const { blanksAroundListsRule } = await import('../../../src/rules/markdown/blanks-around-lists')
    const input = 'Some text\n- Item 1\n- Item 2\n'
    const fixed = blanksAroundListsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('Some text\n\n- Item 1')
  })

  it('fix: adds blank line after list', async () => {
    const { blanksAroundListsRule } = await import('../../../src/rules/markdown/blanks-around-lists')
    const input = '- Item 1\n- Item 2\nSome text\n'
    const fixed = blanksAroundListsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('- Item 2\n\nSome text')
  })

  it('fix: does not add blank before list at start of file', async () => {
    const { blanksAroundListsRule } = await import('../../../src/rules/markdown/blanks-around-lists')
    const input = '- Item 1\n- Item 2\n\nSome text\n'
    const fixed = blanksAroundListsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed.startsWith('\n')).toBe(false)
  })
})

// ─── no-multiple-blanks fix ──────────────────────────────────────────────────

describe('MD012 - no-multiple-blanks check via linter', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-blanks': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      await runLint([tempPath], options)
    }
    finally {
      console.log = originalLog
    }
    return JSON.parse(output)
  }

  it('flags three consecutive blank lines', async () => {
    const result = await lint('Line one\n\n\n\nLine two\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-multiple-blanks')
  })
})

// ─── ul-style fix ────────────────────────────────────────────────────────────

describe('MD004 - ul-style fix', () => {
  it('fix: converts asterisk to dash', async () => {
    const { ulStyleRule } = await import('../../../src/rules/markdown/ul-style')
    const fixed = ulStyleRule.fix!('* Item 1\n* Item 2\n', { filePath: 'test.md', config: {} as any, options: { style: 'dash' } })
    expect(fixed).toContain('- Item 1')
    expect(fixed).not.toContain('* Item')
  })

  it('fix: converts dash to asterisk', async () => {
    const { ulStyleRule } = await import('../../../src/rules/markdown/ul-style')
    const fixed = ulStyleRule.fix!('- Item 1\n- Item 2\n', { filePath: 'test.md', config: {} as any, options: { style: 'asterisk' } })
    expect(fixed).toContain('* Item 1')
    expect(fixed).not.toContain('- Item')
  })

  it('fix: consistent picks first style (dash)', async () => {
    const { ulStyleRule } = await import('../../../src/rules/markdown/ul-style')
    const fixed = ulStyleRule.fix!('- Item 1\n* Item 2\n', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).toContain('- Item 1')
    expect(fixed).toContain('- Item 2')
  })

  it('fix: consistent picks first style (asterisk)', async () => {
    const { ulStyleRule } = await import('../../../src/rules/markdown/ul-style')
    const fixed = ulStyleRule.fix!('* Item 1\n- Item 2\n', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).toContain('* Item 1')
    expect(fixed).toContain('* Item 2')
  })
})

// ─── list-marker-space fix ───────────────────────────────────────────────────

describe('MD030 - list-marker-space fix', () => {
  it('fix: reduces multiple spaces after unordered marker', async () => {
    const { listMarkerSpaceRule } = await import('../../../src/rules/markdown/list-marker-space')
    const fixed = listMarkerSpaceRule.fix!('-  Item 1\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('- Item 1\n')
  })

  it('fix: reduces multiple spaces after ordered marker', async () => {
    const { listMarkerSpaceRule } = await import('../../../src/rules/markdown/list-marker-space')
    const fixed = listMarkerSpaceRule.fix!('1.  Item 1\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('1. Item 1\n')
  })

  it('fix: does not modify correctly spaced markers', async () => {
    const { listMarkerSpaceRule } = await import('../../../src/rules/markdown/list-marker-space')
    const input = '- Item 1\n1. Item 2\n'
    const fixed = listMarkerSpaceRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── ol-prefix fix ───────────────────────────────────────────────────────────

describe('MD029 - ol-prefix fix', () => {
  it('fix: corrects non-sequential numbers to sequential', async () => {
    const { olPrefixRule } = await import('../../../src/rules/markdown/ol-prefix')
    const fixed = olPrefixRule.fix!('1. Item 1\n3. Item 2\n5. Item 3\n', { filePath: 'test.md', config: {} as any, options: { style: 'ordered' } })
    expect(fixed).toContain('1. Item 1')
    expect(fixed).toContain('2. Item 2')
    expect(fixed).toContain('3. Item 3')
  })

  it('fix: converts to all-ones style', async () => {
    const { olPrefixRule } = await import('../../../src/rules/markdown/ol-prefix')
    const fixed = olPrefixRule.fix!('1. Item 1\n2. Item 2\n3. Item 3\n', { filePath: 'test.md', config: {} as any, options: { style: 'one' } })
    expect(fixed).toContain('1. Item 1')
    expect(fixed).toContain('1. Item 2')
    expect(fixed).toContain('1. Item 3')
  })
})
