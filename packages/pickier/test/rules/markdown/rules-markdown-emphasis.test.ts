/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

describe('MD037 - no-space-in-emphasis', () => {
  it('should flag spaces inside emphasis markers', async () => {
    const content = `** text with spaces **
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-space-in-emphasis': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-space-in-emphasis')
    }
    finally {
      console.log = originalLog
    }
  })

  it('ignores emphasis-like content inside a nested fenced block', async () => {
    const { noSpaceInEmphasisRule } = await import('../../../src/rules/markdown/no-space-in-emphasis')
    const md = { filePath: 'a.md', config: {} as any }
    const doc = '~~~\n```\n** hi **\n```\n~~~\n'
    expect(noSpaceInEmphasisRule.check(doc, md)).toHaveLength(0)
    expect(noSpaceInEmphasisRule.fix!(doc, md)).toBe(doc)
  })
})

describe('MD038 - no-space-in-code', () => {
  it('should flag spaces inside code spans', async () => {
    const content = `\` code with spaces \`
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-space-in-code': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-space-in-code')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD049 - emphasis-style', () => {
  it('should flag inconsistent emphasis styles', async () => {
    const content = `*asterisk emphasis* and _underscore emphasis_
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/emphasis-style': ['error', { style: 'consistent' }] })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/emphasis-style')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag underscores inside a fence containing fence-like content', async () => {
    // The ```js line is CONTENT of the tilde fence — it must not flip
    // fence tracking and expose _snake_case_ identifiers to the rule
    const content = '~~~\n```js\nconst _internal_var_ = 1\n```\n~~~\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/emphasis-style': ['error', { style: 'asterisk' }] })
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

describe('MD050 - strong-style', () => {
  it('should flag inconsistent strong styles', async () => {
    const content = `**asterisk strong** and __underscore strong__
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/strong-style': ['error', { style: 'consistent' }] })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/strong-style')
    }
    finally {
      console.log = originalLog
    }
  })
})
