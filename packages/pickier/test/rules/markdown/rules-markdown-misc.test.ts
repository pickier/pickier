/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── proper-names ────────────────────────────────────────────────────────────

describe('MD044 - proper-names', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/proper-names': opts ? ['error', opts] : 'error' })
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

  it('returns no issues when no names configured', async () => {
    const result = await lint('Use javascript here.\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags incorrect capitalization of proper name', async () => {
    const result = await lint('Use javascript here.\n', { names: ['JavaScript'] })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/proper-names')
  })

  it('allows correct capitalization', async () => {
    const result = await lint('Use JavaScript here.\n', { names: ['JavaScript'] })
    expect(result.issues).toHaveLength(0)
  })

  it('checks inside code blocks by default', async () => {
    const result = await lint('```\njavascript\n```\n', { names: ['JavaScript'] })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('skips code blocks when code_blocks is false', async () => {
    const result = await lint('```\njavascript\n```\n', { names: ['JavaScript'], code_blocks: false })
    expect(result.issues).toHaveLength(0)
  })

  it('handles multiple proper names', async () => {
    const result = await lint('Use typescript and javascript.\n', { names: ['TypeScript', 'JavaScript'] })
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── no-alt-text ─────────────────────────────────────────────────────────────

describe('MD045 - no-alt-text', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-alt-text': 'error' })
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

  it('flags image with empty alt text', async () => {
    const result = await lint('![](image.png)\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-alt-text')
  })

  it('allows image with alt text', async () => {
    const result = await lint('![A diagram](image.png)\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips images inside fenced code blocks', async () => {
    const result = await lint('```\n![](image.png)\n```\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips images inside inline code spans', async () => {
    const result = await lint('Use `![](image.png)` in code.\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── descriptive-link-text ───────────────────────────────────────────────────

describe('MD059 - descriptive-link-text', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/descriptive-link-text': 'error' })
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

  it('flags non-descriptive link text "click here"', async () => {
    const result = await lint('[click here](http://example.com)\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/descriptive-link-text')
  })

  it('flags non-descriptive link text "here"', async () => {
    const result = await lint('[here](http://example.com)\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('flags non-descriptive link text "read more"', async () => {
    const result = await lint('[read more](http://example.com)\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows descriptive link text', async () => {
    const result = await lint('[View the documentation](http://example.com)\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── required-headings ───────────────────────────────────────────────────────

describe('MD043 - required-headings', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/required-headings': opts ? ['error', opts] : 'error' })
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

  it('returns no issues when no headings required', async () => {
    const result = await lint('# Any heading\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags missing required heading', async () => {
    const result = await lint('# Introduction\n', { headings: ['Overview'] })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/required-headings')
  })

  it('allows document with required heading', async () => {
    const result = await lint('# Overview\n\nContent\n', { headings: ['Overview'] })
    expect(result.issues).toHaveLength(0)
  })
})

// ─── blanks-around-tables ────────────────────────────────────────────────────

describe('MD058 - blanks-around-tables', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-tables': 'error' })
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

  it('flags missing blank line before table', async () => {
    const result = await lint('Some text\n| Col1 | Col2 |\n| ---- | ---- |\n| a | b |\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/blanks-around-tables')
  })

  it('flags missing blank line after table', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n| a | b |\nSome text\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows properly spaced table', async () => {
    const result = await lint('Some text\n\n| Col1 | Col2 |\n| ---- | ---- |\n| a | b |\n\nMore text\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows table at start of file', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n| a | b |\n\nSome text\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── table-column-count ──────────────────────────────────────────────────────

describe('MD056 - table-column-count', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/table-column-count': 'error' })
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

  it('allows table with consistent column count', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n| a | b |\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags table with inconsistent column count', async () => {
    const result = await lint('| Col1 | Col2 |\n| ---- | ---- |\n| a | b | c |\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/table-column-count')
  })
})

// ─── no-empty-links ──────────────────────────────────────────────────────────

describe('MD042 - no-empty-links', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-empty-links': 'error' })
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

  it('flags empty link URL', async () => {
    const result = await lint('[text]()\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-empty-links')
  })

  it('allows link with URL', async () => {
    const result = await lint('[text](http://example.com)\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags empty link text', async () => {
    const result = await lint('[](http://example.com)\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
