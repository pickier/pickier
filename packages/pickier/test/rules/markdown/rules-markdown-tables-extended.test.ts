/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── table-pipe-style ────────────────────────────────────────────────────────

describe('MD055 - table-pipe-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/table-pipe-style': opts ? ['error', opts] : 'error' })
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

  it('flags missing leading pipe (leading_and_trailing)', async () => {
    const result = await lint('Col1 | Col2 |\n---- | ---- |\n', { style: 'leading_and_trailing' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/table-pipe-style')
  })

  it('flags missing trailing pipe (leading_and_trailing)', async () => {
    const result = await lint('| Col1 | Col2\n| ---- | ----\n', { style: 'leading_and_trailing' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows leading_and_trailing pipes', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n', { style: 'leading_and_trailing' })
    expect(result.issues).toHaveLength(0)
  })

  it('flags trailing pipe in leading_only style', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n', { style: 'leading_only' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows leading_only style', async () => {
    const result = await lint('| Col1 | Col2\n| ---- | ----\n', { style: 'leading_only' })
    expect(result.issues).toHaveLength(0)
  })

  it('flags leading pipe in trailing_only style', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n', { style: 'trailing_only' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows trailing_only style', async () => {
    const result = await lint('Col1 | Col2 |\n---- | ---- |\n', { style: 'trailing_only' })
    expect(result.issues).toHaveLength(0)
  })

  it('flags pipes in no_leading_or_trailing style', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n', { style: 'no_leading_or_trailing' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows no_leading_or_trailing style', async () => {
    const result = await lint('Col1 | Col2\n---- | ----\n', { style: 'no_leading_or_trailing' })
    expect(result.issues).toHaveLength(0)
  })

  it('skips table rows inside fenced code blocks', async () => {
    const result = await lint('```\nCol1 | Col2\n---- | ----\n```\n', { style: 'leading_and_trailing' })
    expect(result.issues).toHaveLength(0)
  })
})

// ─── table-column-style ──────────────────────────────────────────────────────

describe('MD060 - table-column-style', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/table-column-style': 'error' })
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

  it('allows valid table separator with dashes', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n| a | b |\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows left-aligned separator', async () => {
    const result = await lint('| Col1 | Col2 |\n| :--- | :--- |\n| a | b |\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows right-aligned separator', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---: | ---: |\n| a | b |\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows center-aligned separator', async () => {
    const result = await lint('| Col1 | Col2 |\n| :---: | :---: |\n| a | b |\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── blanks-around-headings fix ──────────────────────────────────────────────

describe('MD022 - blanks-around-headings fix', () => {
  it('fix: adds blank line before heading', async () => {
    const { blanksAroundHeadingsRule } = await import('../../../src/rules/markdown/blanks-around-headings')
    const input = 'Some text\n## Heading\n\nMore text\n'
    const fixed = blanksAroundHeadingsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('\n\n## Heading')
  })

  it('fix: adds blank line after heading', async () => {
    const { blanksAroundHeadingsRule } = await import('../../../src/rules/markdown/blanks-around-headings')
    const input = '## Heading\nSome text\n'
    const fixed = blanksAroundHeadingsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('## Heading\n\nSome text')
  })

  it('fix: does not add blank before first heading', async () => {
    const { blanksAroundHeadingsRule } = await import('../../../src/rules/markdown/blanks-around-headings')
    const input = '## Heading\n\nSome text\n'
    const fixed = blanksAroundHeadingsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed.startsWith('\n')).toBe(false)
  })

  it('fix: skips headings in fenced code blocks', async () => {
    const { blanksAroundHeadingsRule } = await import('../../../src/rules/markdown/blanks-around-headings')
    const input = '```\n# not a heading\n```\n'
    const fixed = blanksAroundHeadingsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })

  it('fix: handles setext heading underline', async () => {
    const { blanksAroundHeadingsRule } = await import('../../../src/rules/markdown/blanks-around-headings')
    const input = 'Heading\n=======\nText after\n'
    const fixed = blanksAroundHeadingsRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('=======\n\nText after')
  })
})
