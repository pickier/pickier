import { afterEach, describe, expect, it } from 'bun:test'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/no-eval'

async function lint(content: string) {
  const tempPath = createTempFile(content)
  const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'error' }) }
  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }
  try {
    const code = await runLint([tempPath], options)
    return { code, result: JSON.parse(output) }
  }
  finally { console.log = originalLog }
}

describe('shell/no-eval — exhaustive edge cases', () => {
  it('flags eval at start of line', async () => {
    const { code } = await lint('#!/bin/bash\neval "echo hello"\n')
    expect(code).toBe(1)
  })

  it('flags eval after semicolon', async () => {
    const { code } = await lint('#!/bin/bash\necho "before"; eval "cmd"\n')
    expect(code).toBe(1)
  })

  it('flags eval after pipe', async () => {
    const { code } = await lint('#!/bin/bash\necho "cmd" | eval "read var"\n')
    expect(code).toBe(1)
  })

  it('flags indented eval', async () => {
    const { code } = await lint('#!/bin/bash\n  eval "echo hello"\n')
    expect(code).toBe(1)
  })

  it('does not flag eval in comments', async () => {
    const { code } = await lint('#!/bin/bash\n# eval is dangerous\n')
    expect(code).toBe(0)
  })

  it('does not flag evaluate (different command)', async () => {
    const { code } = await lint('#!/bin/bash\nevaluate_result "test"\n')
    expect(code).toBe(0)
  })

  it('does not flag eval_something (different command)', async () => {
    const { code } = await lint('#!/bin/bash\neval_something "test"\n')
    expect(code).toBe(0)
  })

  it('does not flag heredoc containing eval', async () => {
    const { code } = await lint('#!/bin/bash\ncat <<EOF\neval "hello"\nEOF\n')
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })

  it('handles file with no eval', async () => {
    const { code } = await lint('#!/bin/bash\necho "safe"\nls -la\n')
    expect(code).toBe(0)
  })

  it('flags eval with variable argument', async () => {
    const { code } = await lint('#!/bin/bash\neval "$cmd"\n')
    expect(code).toBe(1)
  })

  it('flags eval with concatenated string', async () => {
    const { code } = await lint('#!/bin/bash\neval "echo" "hello"\n')
    expect(code).toBe(1)
  })
})
