/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { ulStyleRule } from '../../../src/rules/markdown/ul-style'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

describe('MD004 - ul-style', () => {
  it('does not flag list-like markers inside a nested fenced block', () => {
    const md = { filePath: 'a.md', config: {} as any, options: { style: 'dash' } }
    // the ``` line is CONTENT of the ~~~ fence; `* not a list` is inside code
    const doc = '- item\n\n~~~\n```\n* not a list\n```\n~~~\n\n- item2\n'
    expect(ulStyleRule.check(doc, md)).toHaveLength(0)
    expect(ulStyleRule.fix!(doc, md)).toContain('* not a list')
  })

  it('should flag inconsistent unordered list markers', async () => {
    const content = `- Item 1
* Item 2
- Item 3
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-style': ['error', { style: 'consistent' }] })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/ul-style')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag consistent dash markers', async () => {
    const content = `- Item 1
- Item 2
- Item 3
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-style': ['error', { style: 'consistent' }] })
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

describe('MD007 - ul-indent', () => {
  it('should flag incorrect unordered list indentation', async () => {
    const content = `- Item 1
   - Nested item (3 spaces, should be 2)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({
      'markdown/ul-indent': ['error', { indent: 2 }],
      'style/indent-unindent': 'off',
    })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues.some((issue: any) => issue.ruleId === 'markdown/ul-indent')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag correct 2-space indentation', async () => {
    const content = `- Item 1
  - Nested item (2 spaces)
    - Double nested (4 spaces)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-indent': ['error', { indent: 2 }] })
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

describe('MD029 - ol-prefix', () => {
  it('should flag incorrect ordered list numbering (ordered style)', async () => {
    const content = `1. First item
1. Second item (should be 2)
1. Third item (should be 3)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ol-prefix': ['error', { style: 'ordered' }] })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/ol-prefix')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag all-ones numbering with one style', async () => {
    const content = `1. First item
1. Second item
1. Third item
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ol-prefix': ['error', { style: 'one' }] })
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

  it('should not flag sequential numbering with ordered style', async () => {
    const content = `1. First item
2. Second item
3. Third item
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ol-prefix': ['error', { style: 'ordered' }] })
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

describe('MD030 - list-marker-space', () => {
  it('should flag multiple spaces after list marker', async () => {
    const content = `-  Item with two spaces
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/list-marker-space': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/list-marker-space')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag single space after list marker', async () => {
    const content = `- Item with one space
1. Ordered item with one space
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/list-marker-space': 'error' })
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

describe('MD032 - blanks-around-lists', () => {
  it('should flag list without blank lines around it', async () => {
    const content = `Some text
- List item
- Another item
More text
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-lists': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/blanks-around-lists')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag list with proper blank lines', async () => {
    const content = `Some text

- List item
- Another item

More text
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-lists': 'error' })
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
