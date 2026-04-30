/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

describe('MD009 - no-trailing-spaces', () => {
  it('should flag lines with trailing spaces', async () => {
    const content = 'Line with trailing spaces   \nAnother line\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-spaces': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-trailing-spaces')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD010 - no-hard-tabs', () => {
  it('should flag hard tabs', async () => {
    const content = `Line with\ttab
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-hard-tabs': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-hard-tabs')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD012 - no-multiple-blanks', () => {
  it('should flag multiple consecutive blank lines', async () => {
    const content = `First paragraph


Second paragraph (two blank lines above)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-blanks': ['error', { maximum: 1 }] })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-multiple-blanks')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag single blank lines', async () => {
    const content = `First paragraph

Second paragraph
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-blanks': ['error', { maximum: 1 }] })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD031 - blanks-around-fences', () => {
  it('should flag code fence without blank lines', async () => {
    const content = `Some text
\`\`\`js
code();
\`\`\`
More text
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-fences': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/blanks-around-fences')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag code fence with proper blank lines', async () => {
    const content = `Some text

\`\`\`js
code();
\`\`\`

More text
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-fences': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD047 - single-trailing-newline', () => {
  it('should flag missing trailing newline', async () => {
    const content = `Line without newline`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/single-trailing-newline': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/single-trailing-newline')
    }
    finally {
      console.log = originalLog
    }
  })

  // Regression for https://github.com/pickier/pickier/issues/1356
  describe('fix trims excess trailing newlines', () => {
    async function runFix(src: string): Promise<string> {
      const tempPath = createTempFile(src)
      const configPath = createConfigWithMarkdownRules({ 'markdown/single-trailing-newline': 'error' })
      await runLint([tempPath], { reporter: 'json', config: configPath, fix: true })
      const { readFileSync } = await import('node:fs')
      return readFileSync(tempPath, 'utf8')
    }

    it('rewrites two trailing newlines to one', async () => {
      expect(await runFix('hello\n\n')).toBe('hello\n')
    })

    it('rewrites many trailing newlines to one', async () => {
      expect(await runFix('hello\n\n\n\n')).toBe('hello\n')
    })

    it('adds a trailing newline when missing', async () => {
      expect(await runFix('hello')).toBe('hello\n')
    })

    it('leaves a single trailing newline alone', async () => {
      expect(await runFix('hello\n')).toBe('hello\n')
    })

    it('handles CRLF line endings on the trailing chunk', async () => {
      // Both \r\n\r\n and \n\n should collapse to a single trailing \n.
      expect(await runFix('hello\r\n\r\n')).toBe('hello\n')
    })

    it('preserves content while only trimming the trailing chunk', async () => {
      expect(await runFix('# Title\n\nBody paragraph.\n\n')).toBe('# Title\n\nBody paragraph.\n')
    })

    it('trims trailing newlines on a file that also has frontmatter', async () => {
      // Earlier the markdownOnly fix wrapper line-sliced frontmatter back
      // on, which caused the trailing-newline rewrite to be silently
      // discarded for files that combined frontmatter with multiple
      // trailing newlines (issue #1354). Make sure that path still
      // converges here.
      const src = '---\ntitle: t\n---\n\nbody\n\n\n'
      expect(await runFix(src)).toBe('---\ntitle: t\n---\n\nbody\n')
    })
  })
})
