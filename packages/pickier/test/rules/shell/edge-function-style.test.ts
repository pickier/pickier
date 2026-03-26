import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/function-style'

async function lint(content: string) {
  const tempPath = createTempFile(content)
  const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'error' }) }
  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }
  try {
    const code = await runLint([tempPath], options)
    return { code, result: JSON.parse(output), tempPath }
  }
  finally { console.log = originalLog }
}

async function lintFix(content: string) {
  const tempPath = createTempFile(content)
  const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'error' }), fix: true }
  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }
  try {
    await runLint([tempPath], options)
    return readFileSync(tempPath, 'utf8')
  }
  finally { console.log = originalLog }
}

describe('shell/function-style — exhaustive edge cases', () => {
  // ─── Should flag ──────────────────────────────────────────────
  it('flags function keyword without parens', async () => {
    const { code } = await lint('#!/bin/bash\nfunction my_func {\n  echo "hi"\n}\n')
    expect(code).toBe(1)
  })

  it('flags function keyword with parens', async () => {
    const { code } = await lint('#!/bin/bash\nfunction my_func() {\n  echo "hi"\n}\n')
    expect(code).toBe(1)
  })

  it('flags function keyword without brace', async () => {
    const { code } = await lint('#!/bin/bash\nfunction my_func\n{\n  echo "hi"\n}\n')
    expect(code).toBe(1)
  })

  it('flags indented function keyword', async () => {
    const { code } = await lint('#!/bin/bash\n  function my_func {\n    echo "hi"\n  }\n')
    expect(code).toBe(1)
  })

  it('flags multiple function keywords', async () => {
    const { result } = await lint('#!/bin/bash\nfunction foo {\n  :;\n}\nfunction bar {\n  :;\n}\n')
    const issues = result.issues.filter((i: any) => i.ruleId === RULE)
    expect(issues.length).toBe(2)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows POSIX-style name() {', async () => {
    const { code } = await lint('#!/bin/bash\nmy_func() {\n  echo "hi"\n}\n')
    expect(code).toBe(0)
  })

  it('allows name with underscores', async () => {
    const { code } = await lint('#!/bin/bash\nmy_long_function_name() {\n  echo "hi"\n}\n')
    expect(code).toBe(0)
  })

  it('allows function in comments', async () => {
    const { code } = await lint('#!/bin/bash\n# function my_func {\nmy_func() {\n  echo "hi"\n}\n')
    expect(code).toBe(0)
  })

  it('allows function in heredoc', async () => {
    const { code } = await lint('#!/bin/bash\ncat <<EOF\nfunction my_func {\n}\nEOF\n')
    expect(code).toBe(0)
  })

  // ─── Fixer ────────────────────────────────────────────────────
  it('fixes function keyword to POSIX style', async () => {
    const fixed = await lintFix('#!/bin/bash\nfunction my_func {\n  echo "hi"\n}\n')
    expect(fixed).toContain('my_func() {')
    expect(fixed).not.toContain('function')
  })

  it('fixes function keyword with parens', async () => {
    const fixed = await lintFix('#!/bin/bash\nfunction my_func() {\n  echo "hi"\n}\n')
    expect(fixed).toContain('my_func() {')
  })

  it('fixer preserves indentation', async () => {
    const fixed = await lintFix('#!/bin/bash\n  function my_func {\n    echo "hi"\n  }\n')
    expect(fixed).toContain('  my_func() {')
  })

  it('fixer is idempotent', async () => {
    const first = await lintFix('#!/bin/bash\nfunction my_func {\n  echo "hi"\n}\n')
    const secondPath = createTempFile(first)
    const opts: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'error' }), fix: true }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      await runLint([secondPath], opts)
      const second = readFileSync(secondPath, 'utf8')
      expect(second).toBe(first)
    }
    finally { console.log = originalLog }
  })

  it('handles empty file', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })
})
