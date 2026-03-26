import { afterEach, describe, expect, it } from 'bun:test'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/no-cd-without-check'

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

describe('shell/no-cd-without-check — exhaustive edge cases', () => {
  // ─── Should flag ──────────────────────────────────────────────
  it('flags bare cd with path', async () => {
    const { code } = await lint('#!/bin/bash\ncd /some/dir\n')
    expect(code).toBe(1)
  })

  it('flags cd with variable path', async () => {
    const { code } = await lint('#!/bin/bash\ncd "$dir"\n')
    expect(code).toBe(1)
  })

  it('flags cd with home shorthand', async () => {
    const { code } = await lint('#!/bin/bash\ncd ~\n')
    expect(code).toBe(1)
  })

  it('flags cd with relative path', async () => {
    const { code } = await lint('#!/bin/bash\ncd ../parent\n')
    expect(code).toBe(1)
  })

  it('flags cd - (previous directory)', async () => {
    const { code } = await lint('#!/bin/bash\ncd -\n')
    expect(code).toBe(1)
  })

  it('flags cd with tilde expansion', async () => {
    const { code } = await lint('#!/bin/bash\ncd ~/Documents\n')
    expect(code).toBe(1)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows cd || exit 1', async () => {
    const { code } = await lint('#!/bin/bash\ncd /dir || exit 1\n')
    expect(code).toBe(0)
  })

  it('allows cd || return 1', async () => {
    const { code } = await lint('#!/bin/bash\ncd /dir || return 1\n')
    expect(code).toBe(0)
  })

  it('allows cd || die', async () => {
    const { code } = await lint('#!/bin/bash\ncd /dir || die "failed"\n')
    expect(code).toBe(0)
  })

  it('allows cd && command', async () => {
    const { code } = await lint('#!/bin/bash\ncd /dir && make build\n')
    expect(code).toBe(0)
  })

  it('allows cd inside if condition', async () => {
    const { code } = await lint('#!/bin/bash\nif cd /dir; then\n  echo "in dir"\nfi\n')
    expect(code).toBe(0)
  })

  it('allows cd inside subshell', async () => {
    const { code } = await lint('#!/bin/bash\n(cd /dir && make)\n')
    expect(code).toBe(0)
  })

  it('ignores cd in comments', async () => {
    const { code } = await lint('#!/bin/bash\n# cd /some/dir\n')
    expect(code).toBe(0)
  })

  it('ignores cd in heredoc', async () => {
    const { code } = await lint('#!/bin/bash\ncat <<EOF\ncd /some/dir\nEOF\n')
    expect(code).toBe(0)
  })

  // ─── Not-cd commands ──────────────────────────────────────────
  it('does not flag pushd', async () => {
    const { code } = await lint('#!/bin/bash\npushd /dir\n')
    expect(code).toBe(0)
  })

  it('does not flag popd', async () => {
    const { code } = await lint('#!/bin/bash\npopd\n')
    expect(code).toBe(0)
  })

  it('does not flag cdable command', async () => {
    const { code } = await lint('#!/bin/bash\ncdrom_mount /dev/sr0\n')
    expect(code).toBe(0)
  })

  // ─── Edge cases ───────────────────────────────────────────────
  it('handles empty file', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })

  it('handles multiple cd on different lines', async () => {
    const { result } = await lint('#!/bin/bash\ncd /a\ncd /b\n')
    const issues = result.issues.filter((i: any) => i.ruleId === RULE)
    expect(issues.length).toBe(2)
  })
})
