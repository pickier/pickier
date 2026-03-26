import { afterEach, describe, expect, it } from 'bun:test'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/shebang'

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

describe('shell/shebang — exhaustive edge cases', () => {
  // ─── Valid shebangs ───────────────────────────────────────────
  it('accepts #!/bin/bash', async () => {
    const { code } = await lint('#!/bin/bash\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/bin/sh', async () => {
    const { code } = await lint('#!/bin/sh\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/bin/zsh', async () => {
    const { code } = await lint('#!/bin/zsh\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/bin/ksh', async () => {
    const { code } = await lint('#!/bin/ksh\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/bin/dash', async () => {
    const { code } = await lint('#!/bin/dash\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/usr/bin/env bash', async () => {
    const { code } = await lint('#!/usr/bin/env bash\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/usr/bin/env sh', async () => {
    const { code } = await lint('#!/usr/bin/env sh\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/usr/bin/env zsh', async () => {
    const { code } = await lint('#!/usr/bin/env zsh\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/usr/bin/bash', async () => {
    const { code } = await lint('#!/usr/bin/bash\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #!/usr/bin/sh', async () => {
    const { code } = await lint('#!/usr/bin/sh\necho "ok"\n')
    expect(code).toBe(0)
  })

  it('accepts #! /bin/bash (space after #!)', async () => {
    const { code } = await lint('#! /bin/bash\necho "ok"\n')
    expect(code).toBe(0)
  })

  // ─── Invalid shebangs ────────────────────────────────────────
  it('flags #!/usr/bin/python3', async () => {
    const { code } = await lint('#!/usr/bin/python3\necho "ok"\n')
    expect(code).toBe(1)
  })

  it('flags #!/usr/bin/env node', async () => {
    const { code } = await lint('#!/usr/bin/env node\necho "ok"\n')
    expect(code).toBe(1)
  })

  it('flags #!/usr/bin/env perl', async () => {
    const { code } = await lint('#!/usr/bin/env perl\necho "ok"\n')
    expect(code).toBe(1)
  })

  it('flags #!/usr/bin/env ruby', async () => {
    const { code } = await lint('#!/usr/bin/env ruby\necho "ok"\n')
    expect(code).toBe(1)
  })

  // ─── Missing shebang ─────────────────────────────────────────
  it('flags file starting with echo (no shebang)', async () => {
    const { code, result } = await lint('echo "hello"\n')
    expect(code).toBe(1)
    const shebangIssue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(shebangIssue).toBeDefined()
    expect(shebangIssue.message).toContain('Missing shebang')
  })

  it('flags file starting with comment (not shebang)', async () => {
    const { code } = await lint('# This is a script\necho "hello"\n')
    expect(code).toBe(1)
  })

  it('flags file starting with empty line', async () => {
    const { code } = await lint('\necho "hello"\n')
    expect(code).toBe(1)
  })

  // ─── Edge cases ───────────────────────────────────────────────
  it('handles empty file (no content to lint)', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })

  it('correct line number for missing shebang', async () => {
    const { result } = await lint('echo "hello"\n')
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue).toBeDefined()
    expect(issue.line).toBe(1)
  })

  it('correct line number for invalid shebang', async () => {
    const { result } = await lint('#!/usr/bin/perl\n')
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue).toBeDefined()
    expect(issue.line).toBe(1)
  })
})
