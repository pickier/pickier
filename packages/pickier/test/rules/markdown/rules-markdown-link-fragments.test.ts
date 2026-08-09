/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── link-fragments ──────────────────────────────────────────────────────────

describe('MD051 - link-fragments', () => {
  async function lint(content: string) {
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/link-fragments': 'warn' })
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

  it('accepts a link to a heading that exists', async () => {
    const result = await lint('# Getting started\n\nSee [it](#getting-started).\n')
    expect(result.issues).toHaveLength(0)
  })

  it('flags a link to a heading that does not', async () => {
    const result = await lint('# Getting started\n\nSee [it](#nope).\n')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].ruleId).toBe('markdown/link-fragments')
  })

  /**
   * Punctuation is stripped before spaces become hyphens, so a dash or slash
   * between words leaves *two* spaces behind and GitHub emits two hyphens.
   * Collapsing runs of whitespace produced one, and the rule then reported
   * perfectly good anchors as broken -- a linter being wrong about a correct
   * document, which is worse than not checking at all.
   */
  it('keeps both hyphens where an em-dash was stripped, as GitHub does', async () => {
    const result = await lint(
      '## 10. Upstream fixes — at the source\n\nSee [it](#10-upstream-fixes--at-the-source).\n',
    )
    expect(result.issues).toHaveLength(0)
  })

  it('does the same for slashes between words', async () => {
    const result = await lint(
      '### 10.7 stx / craft / bun ranges\n\nSee [it](#107-stx--craft--bun-ranges).\n',
    )
    expect(result.issues).toHaveLength(0)
  })

  it('still rejects the collapsed form, which GitHub does not produce', async () => {
    const result = await lint(
      '## Upstream fixes — at the source\n\nSee [it](#upstream-fixes-at-the-source).\n',
    )
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
