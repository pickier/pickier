/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── no-multiple-blanks (fix path) ───────────────────────────────────────────

describe('MD012 - no-multiple-blanks fix', () => {
  it('fix: collapses multiple blank lines to one', async () => {
    const { noMultipleBlanksRule } = await import('../../../src/rules/markdown/no-multiple-blanks')
    const input = 'Line one\n\n\n\nLine two\n'
    const fixed = noMultipleBlanksRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('Line one\n\nLine two\n')
  })

  it('fix: respects custom maximum', async () => {
    const { noMultipleBlanksRule } = await import('../../../src/rules/markdown/no-multiple-blanks')
    const input = 'Line one\n\n\nLine two\n'
    const fixed = noMultipleBlanksRule.fix!(input, { filePath: 'test.md', config: {} as any, options: { maximum: 2 } })
    expect(fixed).toBe('Line one\n\n\nLine two\n')
  })

  it('check: allows custom maximum', async () => {
    const tempPath = createTempFile('Line one\n\n\nLine two\n')
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-blanks': ['error', { maximum: 2 }] })
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
    const result = JSON.parse(output)
    expect(result.issues).toHaveLength(0)
  })
})

// ─── list-indent ─────────────────────────────────────────────────────────────

describe('MD005 - list-indent', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/list-indent': 'error' })
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

  it('allows consistent list indentation', async () => {
    const result = await lint('- Item 1\n- Item 2\n- Item 3\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows nested list with consistent indentation', async () => {
    const result = await lint('- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags inconsistent indentation at same level', async () => {
    const result = await lint('- Item 1\n   - Nested 1\n  - Nested 2\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

// ─── list-marker-space ───────────────────────────────────────────────────────

describe('MD030 - list-marker-space', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/list-marker-space': 'error' })
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

  it('allows single space after list marker', async () => {
    const result = await lint('- Item 1\n- Item 2\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags multiple spaces after unordered list marker', async () => {
    const result = await lint('-  Item 1\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/list-marker-space')
  })

  it('flags multiple spaces after ordered list marker', async () => {
    const result = await lint('1.  Item 1\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

// ─── ul-style ────────────────────────────────────────────────────────────────

describe('MD004 - ul-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-style': opts ? ['error', opts] : 'error' })
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

  it('allows dash style', async () => {
    const result = await lint('- Item 1\n- Item 2\n', { style: 'dash' })
    expect(result.issues).toHaveLength(0)
  })

  it('flags asterisk when dash required', async () => {
    const result = await lint('* Item 1\n', { style: 'dash' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/ul-style')
  })

  it('flags plus when dash required', async () => {
    const result = await lint('+ Item 1\n', { style: 'dash' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows asterisk style', async () => {
    const result = await lint('* Item 1\n* Item 2\n', { style: 'asterisk' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags mixed markers', async () => {
    const result = await lint('- Item 1\n* Item 2\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows uniform dash', async () => {
    const result = await lint('- Item 1\n- Item 2\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })
})

// ─── ol-prefix ───────────────────────────────────────────────────────────────

describe('MD029 - ol-prefix', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ol-prefix': opts ? ['error', opts] : 'error' })
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

  it('allows ordered list with sequential numbers', async () => {
    const result = await lint('1. Item 1\n2. Item 2\n3. Item 3\n', { style: 'ordered' })
    expect(result.issues).toHaveLength(0)
  })

  it('flags non-sequential numbers when ordered required', async () => {
    const result = await lint('1. Item 1\n3. Item 2\n', { style: 'ordered' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/ol-prefix')
  })

  it('allows all-ones style', async () => {
    const result = await lint('1. Item 1\n1. Item 2\n1. Item 3\n', { style: 'one' })
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-trailing-punctuation fix ─────────────────────────────────────────────

describe('MD026 - no-trailing-punctuation fix', () => {
  it('fix: removes trailing period from ATX heading', async () => {
    const { noTrailingPunctuationRule } = await import('../../../src/rules/markdown/no-trailing-punctuation')
    const fixed = noTrailingPunctuationRule.fix!('# Heading.\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('# Heading')
    expect(fixed).not.toContain('# Heading.')
  })

  it('fix: removes trailing colon from ATX heading', async () => {
    const { noTrailingPunctuationRule } = await import('../../../src/rules/markdown/no-trailing-punctuation')
    const fixed = noTrailingPunctuationRule.fix!('## Section:\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('## Section')
    expect(fixed).not.toContain('## Section:')
  })

  it('fix: removes trailing punctuation from setext heading', async () => {
    const { noTrailingPunctuationRule } = await import('../../../src/rules/markdown/no-trailing-punctuation')
    const fixed = noTrailingPunctuationRule.fix!('Heading.\n========\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toContain('Heading\n')
  })

  it('fix: does not modify non-heading lines', async () => {
    const { noTrailingPunctuationRule } = await import('../../../src/rules/markdown/no-trailing-punctuation')
    const input = 'Regular text.\n'
    const fixed = noTrailingPunctuationRule.fix!(input, { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe(input)
  })
})

// ─── single-trailing-newline ─────────────────────────────────────────────────

describe('MD047 - single-trailing-newline', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/single-trailing-newline': 'error' })
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

  it('allows file ending with single newline', async () => {
    const result = await lint('# Heading\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags file not ending with newline', async () => {
    const result = await lint('# Heading')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/single-trailing-newline')
  })

  it('flags file ending with multiple newlines', async () => {
    const result = await lint('# Heading\n\n\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('fix: adds trailing newline', async () => {
    const { singleTrailingNewlineRule } = await import('../../../src/rules/markdown/single-trailing-newline')
    const fixed = singleTrailingNewlineRule.fix!('# Heading', { filePath: 'test.md', config: {} as any })
    expect(fixed.endsWith('\n')).toBe(true)
  })

  it('fix: removes extra trailing newlines', async () => {
    const { singleTrailingNewlineRule } = await import('../../../src/rules/markdown/single-trailing-newline')
    const fixed = singleTrailingNewlineRule.fix!('# Heading\n\n\n', { filePath: 'test.md', config: {} as any })
    expect(fixed).toBe('# Heading\n')
  })
})
