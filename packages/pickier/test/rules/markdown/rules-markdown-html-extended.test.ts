/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── no-inline-html ──────────────────────────────────────────────────────────

describe('MD033 - no-inline-html', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-inline-html': opts ? ['warn', opts] : 'warn' })
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

  it('flags inline HTML elements', async () => {
    const result = await lint('Use <div> here.\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-inline-html')
  })

  it('flags closing HTML tags', async () => {
    const result = await lint('Use </div> here.\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows URL autolinks', async () => {
    const result = await lint('See <https://example.com> for details.\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows allowed elements', async () => {
    const result = await lint('Use <br> here.\n', { allowed_elements: ['br'] })
    expect(result.issues).toHaveLength(0)
  })

  it('skips HTML inside fenced code blocks', async () => {
    const result = await lint('```\n<div>code</div>\n```\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips HTML inside inline code spans', async () => {
    const result = await lint('Use `<div>` in code.\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-bare-urls fix path ───────────────────────────────────────────────────

describe('MD034 - no-bare-urls fix', () => {
  it('fix: wraps bare URL in angle brackets', async () => {
    const { noBareUrlsRule } = await import('../../../src/rules/markdown/no-bare-urls')
    const fixed = noBareUrlsRule.fix!('Check out https://example.com for info.', { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('<https://example.com>')
  })

  it('fix: does not wrap URL already in angle brackets', async () => {
    const { noBareUrlsRule } = await import('../../../src/rules/markdown/no-bare-urls')
    const input = 'See <https://example.com> for details.'
    const fixed = noBareUrlsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })

  it('fix: does not wrap URL in markdown link', async () => {
    const { noBareUrlsRule } = await import('../../../src/rules/markdown/no-bare-urls')
    const input = '[text](https://example.com)'
    const fixed = noBareUrlsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })

  it('fix: skips fenced code blocks', async () => {
    const { noBareUrlsRule } = await import('../../../src/rules/markdown/no-bare-urls')
    const input = '```\nhttps://example.com\n```\n'
    const fixed = noBareUrlsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })

  it('fix: skips HTML comment blocks', async () => {
    const { noBareUrlsRule } = await import('../../../src/rules/markdown/no-bare-urls')
    const input = '<!-- https://example.com -->\n'
    const fixed = noBareUrlsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })

  it('fix: skips reference link definitions', async () => {
    const { noBareUrlsRule } = await import('../../../src/rules/markdown/no-bare-urls')
    const input = '[ref]: https://example.com\n'
    const fixed = noBareUrlsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── link-fragments ──────────────────────────────────────────────────────────

describe('MD051 - link-fragments', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/link-fragments': 'error' })
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

  it('flags broken fragment link', async () => {
    const result = await lint('# Heading\n\n[link](#nonexistent)\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/link-fragments')
  })

  it('allows valid fragment link', async () => {
    const result = await lint('# My Heading\n\n[link](#my-heading)\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows external links without fragments', async () => {
    const result = await lint('[link](https://example.com)\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── link-image-reference-definitions ───────────────────────────────────────

describe('MD053 - link-image-reference-definitions', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/link-image-reference-definitions': 'error' })
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

  it('flags unused reference definition', async () => {
    const result = await lint('[ref]: https://example.com\n\nSome text without using the ref.\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/link-image-reference-definitions')
  })

  it('allows used reference definition', async () => {
    const result = await lint('[ref]: https://example.com\n\n[link text][ref]\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── reference-links-images ──────────────────────────────────────────────────

describe('MD052 - reference-links-images', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/reference-links-images': 'error' })
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

  it('flags undefined reference link', async () => {
    const result = await lint('[link text][undefined-ref]\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/reference-links-images')
  })

  it('allows defined reference link', async () => {
    const result = await lint('[link text][ref]\n\n[ref]: https://example.com\n')
    expect(result.issues).toHaveLength(0)
  })
})
