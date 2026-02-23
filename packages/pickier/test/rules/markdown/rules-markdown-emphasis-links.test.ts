/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── no-space-in-emphasis ────────────────────────────────────────────────────

describe('MD037 - no-space-in-emphasis', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-space-in-emphasis': 'error' })
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

  it('flags space after opening **', async () => {
    const result = await lint('** bold text**\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-space-in-emphasis')
  })

  it('flags space before closing **', async () => {
    const result = await lint('**bold text **\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('flags space after opening __', async () => {
    const result = await lint('__ bold text__\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('flags space before closing __', async () => {
    const result = await lint('__bold text __\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows properly formatted bold', async () => {
    const result = await lint('**bold text** and __also bold__\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips content inside fenced code blocks', async () => {
    const result = await lint('```\n** not emphasis **\n```\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips content inside inline code spans', async () => {
    const result = await lint('Use `** not emphasis **` in code\n')
    expect(result.issues).toHaveLength(0)
  })

  it('fix: removes space after opening **', async () => {
    const { noSpaceInEmphasisRule } = await import('../../../src/rules/markdown/no-space-in-emphasis')
    const fixed = noSpaceInEmphasisRule.fix!('** bold**', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('**bold**')
  })

  it('fix: removes space before closing **', async () => {
    const { noSpaceInEmphasisRule } = await import('../../../src/rules/markdown/no-space-in-emphasis')
    const fixed = noSpaceInEmphasisRule.fix!('**bold **', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('**bold**')
  })

  it('fix: removes space inside __', async () => {
    const { noSpaceInEmphasisRule } = await import('../../../src/rules/markdown/no-space-in-emphasis')
    const fixed = noSpaceInEmphasisRule.fix!('__ bold__', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('__bold__')
  })

  it('fix: skips fenced code blocks', async () => {
    const { noSpaceInEmphasisRule } = await import('../../../src/rules/markdown/no-space-in-emphasis')
    const input = '```\n** not emphasis **\n```\n'
    const fixed = noSpaceInEmphasisRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── no-space-in-links ───────────────────────────────────────────────────────

describe('MD039 - no-space-in-links', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-space-in-links': 'error' })
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

  it('flags leading space in link text', async () => {
    const result = await lint('[ link text](http://example.com)\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-space-in-links')
  })

  it('flags trailing space in link text', async () => {
    const result = await lint('[link text ](http://example.com)\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows properly formatted link', async () => {
    const result = await lint('[link text](http://example.com)\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows link with internal spaces in text', async () => {
    const result = await lint('[link with spaces](http://example.com)\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-multiple-blanks ──────────────────────────────────────────────────────

describe('MD012 - no-multiple-blanks', () => {
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

  it('flags multiple consecutive blank lines', async () => {
    const result = await lint('Line one\n\n\nLine two\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-multiple-blanks')
  })

  it('allows single blank line', async () => {
    const result = await lint('Line one\n\nLine two\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-multiple-space-blockquote ────────────────────────────────────────────

describe('MD027 - no-multiple-space-blockquote', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-space-blockquote': 'error' })
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

  it('flags multiple spaces after blockquote marker', async () => {
    const result = await lint('>  Multiple spaces\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-multiple-space-blockquote')
  })

  it('allows single space after blockquote marker', async () => {
    const result = await lint('> Single space\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-blanks-blockquote ────────────────────────────────────────────────────

describe('MD028 - no-blanks-blockquote', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-blanks-blockquote': 'error' })
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

  it('flags blank line between blockquote lines', async () => {
    const result = await lint('> Line one\n\n> Line two\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-blanks-blockquote')
  })

  it('allows blockquote without blank lines', async () => {
    const result = await lint('> Line one\n> Line two\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-trailing-punctuation ─────────────────────────────────────────────────

describe('MD026 - no-trailing-punctuation', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-punctuation': 'error' })
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

  it('flags heading ending with period', async () => {
    const result = await lint('# Heading.\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-trailing-punctuation')
  })

  it('flags heading ending with colon', async () => {
    const result = await lint('## Section:\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows heading without trailing punctuation', async () => {
    const result = await lint('# Clean Heading\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags question marks in headings (default punctuation includes ?)', async () => {
    const result = await lint('# What is this?\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('skips headings inside fenced code blocks', async () => {
    const result = await lint('```\n# heading.\n```\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-emphasis-as-heading ──────────────────────────────────────────────────

describe('MD036 - no-emphasis-as-heading', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-emphasis-as-heading': 'error' })
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

  it('flags bold text used as heading', async () => {
    const result = await lint('**Section Title**\n\nSome content\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-emphasis-as-heading')
  })

  it('flags italic text used as heading', async () => {
    const result = await lint('*Section Title*\n\nSome content\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows bold text inline in paragraph', async () => {
    const result = await lint('This is **bold** text in a paragraph.\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows proper headings', async () => {
    const result = await lint('## Proper Heading\n\nContent\n')
    expect(result.issues).toHaveLength(0)
  })
})
