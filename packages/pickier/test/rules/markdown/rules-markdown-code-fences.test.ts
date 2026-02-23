/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── code-fence-style ────────────────────────────────────────────────────────

describe('MD048 - code-fence-style', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/code-fence-style': opts ? ['error', opts] : 'error' })
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

  it('flags backtick fence when tilde required', async () => {
    const result = await lint('```js\ncode\n```\n', { style: 'tilde' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/code-fence-style')
  })

  it('flags tilde fence when backtick required', async () => {
    const result = await lint('~~~js\ncode\n~~~\n', { style: 'backtick' })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/code-fence-style')
  })

  it('allows backtick when backtick required', async () => {
    const result = await lint('```js\ncode\n```\n', { style: 'backtick' })
    expect(result.issues).toHaveLength(0)
  })

  it('allows tilde when tilde required', async () => {
    const result = await lint('~~~js\ncode\n~~~\n', { style: 'tilde' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: flags mixed fence styles', async () => {
    const result = await lint('```js\ncode\n```\n\n~~~py\ncode\n~~~\n', { style: 'consistent' })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('consistent: allows uniform backtick fences', async () => {
    const result = await lint('```js\ncode\n```\n\n```py\ncode\n```\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })

  it('consistent: allows uniform tilde fences', async () => {
    const result = await lint('~~~js\ncode\n~~~\n\n~~~py\ncode\n~~~\n', { style: 'consistent' })
    expect(result.issues).toHaveLength(0)
  })

  it('fix: converts tilde to backtick', async () => {
    const { codeFenceStyleRule } = await import('../../../src/rules/markdown/code-fence-style')
    const fixed = codeFenceStyleRule.fix!('~~~js\ncode\n~~~\n', { filePath: 'test.md', config: {} as any, options: { style: 'backtick' } })
    expect(fixed).toContain('```js')
    expect(fixed).not.toContain('~~~')
  })

  it('fix: converts backtick to tilde', async () => {
    const { codeFenceStyleRule } = await import('../../../src/rules/markdown/code-fence-style')
    const fixed = codeFenceStyleRule.fix!('```js\ncode\n```\n', { filePath: 'test.md', config: {} as any, options: { style: 'tilde' } })
    expect(fixed).toContain('~~~js')
    expect(fixed).not.toContain('```')
  })

  it('fix: consistent picks first style (backtick)', async () => {
    const { codeFenceStyleRule } = await import('../../../src/rules/markdown/code-fence-style')
    const fixed = codeFenceStyleRule.fix!('```js\ncode\n```\n\n~~~py\ncode\n~~~\n', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).not.toContain('~~~')
  })

  it('fix: consistent picks first style (tilde)', async () => {
    const { codeFenceStyleRule } = await import('../../../src/rules/markdown/code-fence-style')
    const fixed = codeFenceStyleRule.fix!('~~~js\ncode\n~~~\n\n```py\ncode\n```\n', { filePath: 'test.md', config: {} as any, options: { style: 'consistent' } })
    expect(fixed).not.toContain('```')
  })
})

// ─── heading-start-left ──────────────────────────────────────────────────────

describe('MD023 - heading-start-left', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/heading-start-left': 'error' })
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

  it('flags indented heading', async () => {
    const result = await lint('  # Indented heading\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/heading-start-left')
  })

  it('allows heading at start of line', async () => {
    const result = await lint('# Proper heading\n')
    expect(result.issues).toHaveLength(0)
  })

  it('skips indented headings in fenced code blocks', async () => {
    const result = await lint('```\n  # not a heading\n```\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-duplicate-heading ────────────────────────────────────────────────────

describe('MD024 - no-duplicate-heading', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-duplicate-heading': 'error' })
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

  it('flags duplicate headings', async () => {
    const result = await lint('# Heading\n\n## Section\n\n# Heading\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-duplicate-heading')
  })

  it('allows unique headings', async () => {
    const result = await lint('# Heading One\n\n## Section\n\n# Heading Two\n')
    expect(result.issues).toHaveLength(0)
  })

  it('is case-sensitive (different case = different heading)', async () => {
    const result = await lint('# Heading\n\n# heading\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-missing-space-closed-atx ─────────────────────────────────────────────

describe('MD020 - no-missing-space-closed-atx', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-closed-atx': 'error' })
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

  it('flags missing space before closing hashes', async () => {
    const result = await lint('# Heading##\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-missing-space-closed-atx')
  })

  it('allows space before closing hashes', async () => {
    const result = await lint('# Heading #\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows ATX heading without closing hashes', async () => {
    const result = await lint('# Heading\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-multiple-space-closed-atx ────────────────────────────────────────────

describe('MD021 - no-multiple-space-closed-atx', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-space-closed-atx': 'error' })
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

  it('flags multiple spaces before closing hashes', async () => {
    const result = await lint('# Heading  ##\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-multiple-space-closed-atx')
  })

  it('allows single space before closing hashes', async () => {
    const result = await lint('# Heading #\n')
    expect(result.issues).toHaveLength(0)
  })
})
