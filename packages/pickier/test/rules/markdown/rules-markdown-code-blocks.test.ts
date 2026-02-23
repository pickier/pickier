/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── code-block-style ────────────────────────────────────────────────────────

describe('MD046 - code-block-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/code-block-style': opts ? ['error', opts] : 'error' })
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

  it('flags fenced code block when indented style required', async () => {
    const result = await lint('```js\ncode\n```\n', { style: 'indented' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/code-block-style')
  })

  it('flags indented code block when fenced style required', async () => {
    const result = await lint('Text\n\n    code here\n', { style: 'fenced' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/code-block-style')
  })

  it('allows fenced code block when fenced style required', async () => {
    const result = await lint('```js\ncode\n```\n', { style: 'fenced' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags mixed code block styles', async () => {
    const result = await lint('```js\ncode\n```\n\nText\n\n    indented code\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows uniform fenced style', async () => {
    const result = await lint('```js\ncode\n```\n\n```py\nmore code\n```\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })
})

// ─── ul-indent ───────────────────────────────────────────────────────────────

describe('MD007 - ul-indent', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-indent': opts ? ['error', opts] : 'error' })
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

  it('allows properly indented nested list (2 spaces)', async () => {
    const result = await lint('- Item 1\n  - Nested\n- Item 2\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags incorrect indentation (3 spaces when 2 expected)', async () => {
    const result = await lint('- Item 1\n   - Nested\n- Item 2\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows custom indent size', async () => {
    const result = await lint('- Item 1\n    - Nested\n- Item 2\n', { indent: 4 })
    expect(result.issues).toHaveLength(0)
  })

  it('skips items inside fenced code blocks', async () => {
    const result = await lint('```\n   - not a list\n```\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-missing-space-atx fix ────────────────────────────────────────────────

describe('MD018 - no-missing-space-atx fix', () => {
  it('fix: adds space after opening hashes', async () => {
    const { noMissingSpaceAtxRule } = await import('../../../src/rules/markdown/no-missing-space-atx')
    const fixed = noMissingSpaceAtxRule.fix!('#Heading\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('# Heading')
  })

  it('fix: does not modify already correct headings', async () => {
    const { noMissingSpaceAtxRule } = await import('../../../src/rules/markdown/no-missing-space-atx')
    const input = '# Heading\n'
    const fixed = noMissingSpaceAtxRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── no-multiple-space-atx fix ───────────────────────────────────────────────

describe('MD019 - no-multiple-space-atx fix', () => {
  it('fix: removes extra spaces after opening hashes', async () => {
    const { noMultipleSpaceAtxRule } = await import('../../../src/rules/markdown/no-multiple-space-atx')
    const fixed = noMultipleSpaceAtxRule.fix!('#  Heading\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('# Heading')
  })

  it('fix: does not modify already correct headings', async () => {
    const { noMultipleSpaceAtxRule } = await import('../../../src/rules/markdown/no-multiple-space-atx')
    const input = '# Heading\n'
    const fixed = noMultipleSpaceAtxRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── no-trailing-spaces fix ──────────────────────────────────────────────────

describe('MD009 - no-trailing-spaces fix', () => {
  it('fix: removes trailing spaces', async () => {
    const { noTrailingSpacesRule } = await import('../../../src/rules/markdown/no-trailing-spaces')
    const fixed = noTrailingSpacesRule.fix!('Line with spaces   \n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('Line with spaces\n')
  })

  it('fix: does not modify lines without trailing spaces', async () => {
    const { noTrailingSpacesRule } = await import('../../../src/rules/markdown/no-trailing-spaces')
    const input = 'Clean line\n'
    const fixed = noTrailingSpacesRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── no-hard-tabs fix ────────────────────────────────────────────────────────

describe('MD010 - no-hard-tabs fix', () => {
  it('fix: replaces tabs with spaces', async () => {
    const { noHardTabsRule } = await import('../../../src/rules/markdown/no-hard-tabs')
    const fixed = noHardTabsRule.fix!('Line\twith\ttabs\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).not.toContain('\t')
  })

  it('fix: does not modify lines without tabs', async () => {
    const { noHardTabsRule } = await import('../../../src/rules/markdown/no-hard-tabs')
    const input = 'Clean line\n'
    const fixed = noHardTabsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})
