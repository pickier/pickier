/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

describe('MD011 - no-reversed-links', () => {
  it('should flag reversed link syntax', async () => {
    const content = `(text)[http://example.com]
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-reversed-links': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-reversed-links')
    }
    finally {
      console.log = originalLog
    }
  })

  // Regression for https://github.com/pickier/pickier/issues/1355
  it('should NOT flag (text)[url] patterns inside fenced code blocks', async () => {
    // TypeScript syntax like `import('zod')['z']` matches the reversed-link
    // regex `(text)[url]`. Fenced code-block content isn't markdown and
    // must be skipped — same applies to ``` ~~~ ``` fences and indented
    // code blocks.
    const content = [
      '## Example',
      '',
      '```typescript',
      'declare global {',
      '  const z: typeof import(\'zod\')[\'z\']',
      '  const clsx: typeof import(\'clsx\')[\'clsx\']',
      '}',
      '```',
      '',
    ].join('\n')
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-reversed-links': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      await runLint([tempPath], options)
      console.log = originalLog
      const result = JSON.parse(output)
      expect(result.issues.filter((i: { ruleId: string }) => i.ruleId === 'markdown/no-reversed-links')).toEqual([])
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD034 - no-bare-urls', () => {
  it('should flag bare URLs', async () => {
    const content = `Check out http://example.com for more info.
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-bare-urls': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-bare-urls')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag URLs in angle brackets', async () => {
    const content = `Check out <http://example.com> for more info.
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-bare-urls': 'error' })
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

describe('MD042 - no-empty-links', () => {
  it('should flag empty link URLs', async () => {
    const content = `[Empty link]()
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-empty-links': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-empty-links')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should flag empty link text', async () => {
    const content = `[](http://example.com)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-empty-links': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-empty-links')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD059 - descriptive-link-text', () => {
  it('should flag non-descriptive link text', async () => {
    const content = `[Click here](http://example.com)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/descriptive-link-text': 'warn' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/descriptive-link-text')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag descriptive link text', async () => {
    const content = `[Visit the Markdown Guide](http://example.com)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/descriptive-link-text': 'warn' })
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
