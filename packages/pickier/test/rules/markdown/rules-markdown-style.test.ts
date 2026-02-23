/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── heading-style ───────────────────────────────────────────────────────────

describe('MD003 - heading-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/heading-style': opts ? ['error', opts] : 'error' })
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

  it('flags ATX heading when setext style required', async () => {
    const result = await lint('# Heading\n', { style: 'setext' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/heading-style')
  })

  it('flags setext heading when atx style required', async () => {
    const result = await lint('Heading\n=======\n', { style: 'atx' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/heading-style')
  })

  it('allows ATX when atx style required', async () => {
    const result = await lint('# Heading\n\n## Sub\n', { style: 'atx' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags mixed ATX after setext', async () => {
    const result = await lint('Heading\n=======\n\n## ATX heading\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: flags mixed setext after ATX', async () => {
    const result = await lint('# ATX\n\nSetext\n------\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows all ATX', async () => {
    const result = await lint('# H1\n\n## H2\n\n### H3\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })
})

// ─── blanks-around-headings ──────────────────────────────────────────────────

describe('MD022 - blanks-around-headings', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-headings': 'error' })
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

  it('flags heading without blank line before', async () => {
    const result = await lint('Some text\n## Heading\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/blanks-around-headings')
  })

  it('flags heading without blank line after', async () => {
    const result = await lint('## Heading\nSome text\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('allows heading at start of file', async () => {
    const result = await lint('## Heading\n\nSome text\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows properly spaced headings', async () => {
    const result = await lint('# H1\n\nText\n\n## H2\n\nMore text\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips headings inside fenced code blocks', async () => {
    const result = await lint('```\n# not a heading\n```\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags consecutive headings without blank between', async () => {
    const result = await lint('# H1\n## H2\n\nText\n')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('handles setext-style heading with blank after underline', async () => {
    const result = await lint('Heading\n=======\n\nText\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── hr-style ────────────────────────────────────────────────────────────────

describe('MD035 - hr-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/hr-style': opts ? ['error', opts] : 'error' })
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

  it('flags wrong HR style when specific style required', async () => {
    const result = await lint('---\n\n***\n', { style: '---' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/hr-style')
  })

  it('allows correct HR style', async () => {
    const result = await lint('---\n\n---\n', { style: '---' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags mixed HR styles', async () => {
    const result = await lint('---\n\n***\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows uniform HR style', async () => {
    const result = await lint('---\n\n---\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })
})

// ─── emphasis-style ──────────────────────────────────────────────────────────

describe('MD049 - emphasis-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/emphasis-style': opts ? ['error', opts] : 'error' })
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

  it('flags asterisk emphasis when underscore required', async () => {
    const result = await lint('This is *italic* text.\n', { style: 'underscore' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/emphasis-style')
  })

  it('flags underscore emphasis when asterisk required', async () => {
    const result = await lint('This is _italic_ text.\n', { style: 'asterisk' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/emphasis-style')
  })

  it('allows asterisk when asterisk required', async () => {
    const result = await lint('This is *italic* text.\n', { style: 'asterisk' })
    expect(result.issues).toHaveLength(0)
  })

  it('allows underscore when underscore required', async () => {
    const result = await lint('This is _italic_ text.\n', { style: 'underscore' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags mixed emphasis styles', async () => {
    const result = await lint('*asterisk* and _underscore_\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows uniform asterisk emphasis', async () => {
    const result = await lint('*one* and *two*\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: allows uniform underscore emphasis', async () => {
    const result = await lint('_one_ and _two_\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })

  it('skips emphasis inside fenced code blocks', async () => {
    const result = await lint('```\n*not emphasis*\n```\n', { style: 'underscore' })
    expect(result.issues).toHaveLength(0)
  })

  it('fix: converts underscore to asterisk', async () => {
    const { emphasisStyleRule } = await import('../../../src/rules/markdown/emphasis-style')
    const fixed = emphasisStyleRule.fix!('_italic_', { filePath: 'test.md', config: {} as any, options: { style: 'asterisk' } })
    expect(fixed).toBe('*italic*')
  })

  it('fix: converts asterisk to underscore', async () => {
    const { emphasisStyleRule } = await import('../../../src/rules/markdown/emphasis-style')
    const fixed = emphasisStyleRule.fix!('*italic*', { filePath: 'test.md', config: {} as any, options: { style: 'underscore' } })
    expect(fixed).toBe('_italic_')
  })

  it('fix: consistent picks first style (asterisk)', async () => {
    const { emphasisStyleRule } = await import('../../../src/rules/markdown/emphasis-style')
    const fixed = emphasisStyleRule.fix!('*first* and _second_', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).toBe('*first* and *second*')
  })

  it('fix: consistent picks first style (underscore)', async () => {
    const { emphasisStyleRule } = await import('../../../src/rules/markdown/emphasis-style')
    const fixed = emphasisStyleRule.fix!('_first_ and *second*', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).toBe('_first_ and _second_')
  })
})

// ─── strong-style ────────────────────────────────────────────────────────────

describe('MD050 - strong-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/strong-style': opts ? ['error', opts] : 'error' })
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

  it('flags asterisk strong when underscore required', async () => {
    const result = await lint('This is **bold** text.\n', { style: 'underscore' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/strong-style')
  })

  it('flags underscore strong when asterisk required', async () => {
    const result = await lint('This is __bold__ text.\n', { style: 'asterisk' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/strong-style')
  })

  it('allows asterisk when asterisk required', async () => {
    const result = await lint('This is **bold** text.\n', { style: 'asterisk' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags mixed strong styles', async () => {
    const result = await lint('**asterisk** and __underscore__\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows uniform asterisk strong', async () => {
    const result = await lint('**one** and **two**\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })

  it('fix: converts underscore to asterisk', async () => {
    const { strongStyleRule } = await import('../../../src/rules/markdown/strong-style')
    const fixed = strongStyleRule.fix!('__bold__', { filePath: 'test.md', config: {} as any, options: { style: 'asterisk' } })
    expect(fixed).toBe('**bold**')
  })

  it('fix: converts asterisk to underscore', async () => {
    const { strongStyleRule } = await import('../../../src/rules/markdown/strong-style')
    const fixed = strongStyleRule.fix!('**bold**', { filePath: 'test.md', config: {} as any, options: { style: 'underscore' } })
    expect(fixed).toBe('__bold__')
  })

  it('fix: consistent picks first style (asterisk)', async () => {
    const { strongStyleRule } = await import('../../../src/rules/markdown/strong-style')
    const fixed = strongStyleRule.fix!('**first** and __second__', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).toBe('**first** and **second**')
  })

  it('fix: consistent picks first style (underscore)', async () => {
    const { strongStyleRule } = await import('../../../src/rules/markdown/strong-style')
    const fixed = strongStyleRule.fix!('__first__ and **second**', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).toBe('__first__ and __second__')
  })
})

// ─── link-image-style ────────────────────────────────────────────────────────

describe('MD054 - link-image-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/link-image-style': opts ? ['error', opts] : 'error' })
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

  it('flags inline link when reference style required', async () => {
    const result = await lint('[text](http://example.com)\n', { style: 'reference' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/link-image-style')
  })

  it('flags reference link when inline style required', async () => {
    const result = await lint('[text][ref]\n\n[ref]: http://example.com\n', { style: 'inline' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/link-image-style')
  })

  it('allows inline link when inline style required', async () => {
    const result = await lint('[text](http://example.com)\n', { style: 'inline' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags inline after reference', async () => {
    const result = await lint('[ref-link][ref]\n[inline](http://example.com)\n\n[ref]: http://example.com\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: flags reference after inline', async () => {
    const result = await lint('[inline](http://example.com)\n[ref-link][ref]\n\n[ref]: http://example.com\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows all inline links', async () => {
    const result = await lint('[a](http://a.com) and [b](http://b.com)\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })

  it('skips links inside fenced code blocks', async () => {
    const result = await lint('```\n[text](url)\n```\n', { style: 'reference' })
    expect(result.issues).toHaveLength(0)
  })

  it('skips HTML comment blocks', async () => {
    const result = await lint('<!-- [text](url) -->\n', { style: 'reference' })
    expect(result.issues).toHaveLength(0)
  })

  it('skips definition lines', async () => {
    const result = await lint('[ref]: http://example.com\n', { style: 'reference' })
    expect(result.issues).toHaveLength(0)
  })
})
