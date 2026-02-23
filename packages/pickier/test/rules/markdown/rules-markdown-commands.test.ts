/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── commands-show-output ────────────────────────────────────────────────────

describe('MD014 - commands-show-output', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/commands-show-output': 'warn' })
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

  it('flags commands with $ prefix when no output shown', async () => {
    const result = await lint('```sh\n$ npm install\n$ npm test\n```\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/commands-show-output')
  })

  it('allows $ prefix when output is also shown', async () => {
    const result = await lint('```sh\n$ npm install\nadded 100 packages\n```\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows commands without $ prefix', async () => {
    const result = await lint('```sh\nnpm install\nnpm test\n```\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-missing-space-closed-atx ─────────────────────────────────────────────

describe('MD020 - no-missing-space-closed-atx (additional)', () => {
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

  it('flags closed ATX heading with no space before closing hashes', async () => {
    const result = await lint('# Heading# \n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-missing-space-closed-atx')
  })

  it('allows closed ATX heading with spaces', async () => {
    const result = await lint('# Heading #\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-missing-space-atx ────────────────────────────────────────────────────

describe('MD018 - no-missing-space-atx', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
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

  it('flags ATX heading without space after hashes', async () => {
    const result = await lint('#Heading\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-missing-space-atx')
  })

  it('allows ATX heading with space after hashes', async () => {
    const result = await lint('# Heading\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── no-multiple-space-atx ───────────────────────────────────────────────────

describe('MD019 - no-multiple-space-atx', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-space-atx': 'error' })
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

  it('flags ATX heading with multiple spaces after hashes', async () => {
    const result = await lint('#  Heading\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/no-multiple-space-atx')
  })

  it('allows ATX heading with single space after hashes', async () => {
    const result = await lint('# Heading\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── single-title ────────────────────────────────────────────────────────────

describe('MD025 - single-title', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/single-title': 'error' })
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

  it('flags multiple H1 headings', async () => {
    const result = await lint('# Title One\n\n# Title Two\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/single-title')
  })

  it('allows single H1 heading', async () => {
    const result = await lint('# Title\n\n## Section\n')
    expect(result.issues).toHaveLength(0)
  })
})

// ─── line-length ─────────────────────────────────────────────────────────────

describe('MD013 - line-length', () => {
  async function lint(content: string, opts?: any) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/line-length': opts ? ['error', opts] : 'error' })
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

  it('flags lines exceeding default length', async () => {
    const longLine = 'A'.repeat(81) + '\n'
    const result = await lint(longLine)
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/line-length')
  })

  it('allows lines within default length', async () => {
    const result = await lint('Short line\n')
    expect(result.issues).toHaveLength(0)
  })

  it('allows lines within custom length', async () => {
    const result = await lint('A'.repeat(100) + '\n', { line_length: 120 })
    expect(result.issues).toHaveLength(0)
  })

  it('flags lines exceeding custom length', async () => {
    const result = await lint('A'.repeat(61) + '\n', { line_length: 60 })
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
