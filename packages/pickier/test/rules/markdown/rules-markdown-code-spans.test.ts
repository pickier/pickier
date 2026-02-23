/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── no-space-in-code ────────────────────────────────────────────────────────

describe('MD038 - no-space-in-code', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-space-in-code': 'error' })
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

  it('flags spaces inside code span', async () => {
    const result = await lint('Use ` code ` here.\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-space-in-code')
  })

  it('allows code span without spaces', async () => {
    const result = await lint('Use `code` here.\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows code span with only leading space (not both)', async () => {
    const result = await lint('Use ` code` here.\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows code span with only trailing space (not both)', async () => {
    const result = await lint('Use `code ` here.\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips content inside fenced code blocks', async () => {
    const result = await lint('```\n` code `\n```\n')
    expect(result.issues).toHaveLength(0)
  })

  it('fix: removes spaces inside code span', async () => {
    const { noSpaceInCodeRule } = await import('../../../src/rules/markdown/no-space-in-code')
    const fixed = noSpaceInCodeRule.fix!('Use ` code ` here.', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('Use `code` here.')
  })

  it('fix: skips fenced code blocks', async () => {
    const { noSpaceInCodeRule } = await import('../../../src/rules/markdown/no-space-in-code')
    const input = '```\n` code `\n```\n'
    const fixed = noSpaceInCodeRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })

  it('fix: does not modify code spans without spaces', async () => {
    const { noSpaceInCodeRule } = await import('../../../src/rules/markdown/no-space-in-code')
    const input = 'Use `code` here.'
    const fixed = noSpaceInCodeRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── no-trailing-spaces ──────────────────────────────────────────────────────

describe('MD009 - no-trailing-spaces', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-spaces': 'error' })
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

  it('flags trailing spaces', async () => {
    const result = await lint('Line with trailing spaces   \n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-trailing-spaces')
  })

  it('allows lines without trailing spaces', async () => {
    const result = await lint('Clean line\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-hard-tabs ────────────────────────────────────────────────────────────

describe('MD010 - no-hard-tabs', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-hard-tabs': 'error' })
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

  it('flags hard tabs', async () => {
    const result = await lint('Line with\ttab\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-hard-tabs')
  })

  it('allows lines without tabs', async () => {
    const result = await lint('Clean line without tabs\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── fenced-code-language ────────────────────────────────────────────────────

describe('MD040 - fenced-code-language', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/fenced-code-language': 'error' })
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

  it('flags fenced code block without language', async () => {
    const result = await lint('```\ncode here\n```\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/fenced-code-language')
  })

  it('allows fenced code block with language', async () => {
    const result = await lint('```js\ncode here\n```\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows tilde fenced code block with language', async () => {
    const result = await lint('~~~python\ncode here\n~~~\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── first-line-heading ──────────────────────────────────────────────────────

describe('MD041 - first-line-heading', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/first-line-heading': 'error' })
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

  it('flags file not starting with heading', async () => {
    const result = await lint('Some text\n\n# Heading\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/first-line-heading')
  })

  it('allows file starting with heading', async () => {
    const result = await lint('# Heading\n\nSome text\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows file starting with blank line then heading', async () => {
    const result = await lint('\n# Heading\n\nSome text\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── blanks-around-fences ────────────────────────────────────────────────────

describe('MD031 - blanks-around-fences', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-fences': 'error' })
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

  it('flags missing blank line before fence', async () => {
    const result = await lint('Some text\n```js\ncode\n```\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/blanks-around-fences')
  })

  it('flags missing blank line after fence', async () => {
    const result = await lint('```js\ncode\n```\nSome text\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows properly spaced fence', async () => {
    const result = await lint('Some text\n\n```js\ncode\n```\n\nMore text\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows fence at start of file', async () => {
    const result = await lint('```js\ncode\n```\n\nSome text\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── blanks-around-lists ─────────────────────────────────────────────────────

describe('MD032 - blanks-around-lists', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-lists': 'error' })
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

  it('flags missing blank line before list', async () => {
    const result = await lint('Some text\n- Item 1\n- Item 2\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/blanks-around-lists')
  })

  it('flags missing blank line after list', async () => {
    const result = await lint('- Item 1\n- Item 2\nSome text\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows properly spaced list', async () => {
    const result = await lint('Some text\n\n- Item 1\n- Item 2\n\nMore text\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows list at start of file', async () => {
    const result = await lint('- Item 1\n- Item 2\n\nSome text\n')
    expect(result.issues).toHaveLength(0)
  })
})
