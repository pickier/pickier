import { afterEach, describe, expect, it } from 'bun:test'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/quote-variables'

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

describe('shell/quote-variables — exhaustive edge cases', () => {
  // ─── Should flag ──────────────────────────────────────────────
  it('flags bare $var in echo', async () => {
    const { code, result } = await lint('#!/bin/bash\necho $name\n')
    expect(code).toBe(1)
    expect(result.issues.some((i: any) => i.ruleId === RULE)).toBe(true)
  })

  it('flags bare ${var} in echo', async () => {
    const { code } = await lint('#!/bin/bash\necho ${name}\n')
    expect(code).toBe(1)
  })

  it('flags bare $var as command argument', async () => {
    const { code } = await lint('#!/bin/bash\nrm $file\n')
    expect(code).toBe(1)
  })

  it('flags bare ${var:-default} pattern', async () => {
    const { code } = await lint('#!/bin/bash\necho ${name:-default}\n')
    expect(code).toBe(1)
  })

  it('flags bare ${var#prefix} parameter expansion', async () => {
    const { code } = await lint('#!/bin/bash\necho ${path#/usr}\n')
    expect(code).toBe(1)
  })

  it('flags multiple unquoted vars on same line', async () => {
    const { result } = await lint('#!/bin/bash\ncp $src $dst\n')
    const issues = result.issues.filter((i: any) => i.ruleId === RULE)
    expect(issues.length).toBe(2)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows "$var" in double quotes', async () => {
    const { code } = await lint('#!/bin/bash\necho "$name"\n')
    expect(code).toBe(0)
  })

  it('allows "${var}" in double quotes', async () => {
    const { code } = await lint('#!/bin/bash\necho "${name}"\n')
    expect(code).toBe(0)
  })

  it('allows $var inside [[ ]] (no word splitting)', async () => {
    const { code } = await lint('#!/bin/bash\nif [[ $var == "test" ]]; then echo ok; fi\n')
    expect(code).toBe(0)
  })

  it('allows $var inside (( )) arithmetic', async () => {
    const { code } = await lint('#!/bin/bash\nif (( $count > 5 )); then echo big; fi\n')
    expect(code).toBe(0)
  })

  it('allows $var in local declaration', async () => {
    const { code } = await lint('#!/bin/bash\nlocal result=$var\n')
    expect(code).toBe(0)
  })

  it('allows $var in export declaration', async () => {
    const { code } = await lint('#!/bin/bash\nexport PATH=$PATH:/usr/local/bin\n')
    expect(code).toBe(0)
  })

  it('allows $var in declare declaration', async () => {
    const { code } = await lint('#!/bin/bash\ndeclare -r CONST=$var\n')
    expect(code).toBe(0)
  })

  it('allows $var in readonly declaration', async () => {
    const { code } = await lint('#!/bin/bash\nreadonly CONST=$var\n')
    expect(code).toBe(0)
  })

  it('allows $var in typeset declaration', async () => {
    const { code } = await lint('#!/bin/bash\ntypeset -i num=$var\n')
    expect(code).toBe(0)
  })

  it('ignores variables in comments', async () => {
    const { code } = await lint('#!/bin/bash\n# echo $name\n')
    expect(code).toBe(0)
  })

  it('ignores variables in inline comments', async () => {
    const { code } = await lint('#!/bin/bash\necho "ok" # $name here\n')
    expect(code).toBe(0)
  })

  it('ignores variables inside single quotes', async () => {
    const { code } = await lint("#!/bin/bash\necho '$not_expanded'\n")
    expect(code).toBe(0)
  })

  it('ignores variables inside heredoc', async () => {
    const { code } = await lint('#!/bin/bash\ncat <<EOF\n$name\nEOF\n')
    expect(code).toBe(0)
  })

  // ─── Special variables (should skip) ──────────────────────────
  it('does not flag $? (exit status)', async () => {
    const { code } = await lint('#!/bin/bash\necho $?\n')
    expect(code).toBe(0)
  })

  it('does not flag $! (background pid)', async () => {
    const { code } = await lint('#!/bin/bash\necho $!\n')
    expect(code).toBe(0)
  })

  it('does not flag $# (param count)', async () => {
    const { code } = await lint('#!/bin/bash\necho $#\n')
    expect(code).toBe(0)
  })

  it('does not flag $@ (all params)', async () => {
    const { code } = await lint('#!/bin/bash\necho $@\n')
    expect(code).toBe(0)
  })

  it('does not flag $* (all params)', async () => {
    const { code } = await lint('#!/bin/bash\necho $*\n')
    expect(code).toBe(0)
  })

  it('does not flag $0 (script name)', async () => {
    const { code } = await lint('#!/bin/bash\necho $0\n')
    expect(code).toBe(0)
  })

  // ─── Edge cases ───────────────────────────────────────────────
  it('handles escaped dollar sign', async () => {
    const { code } = await lint('#!/bin/bash\necho \\$notavar\n')
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })

  it('handles file with only shebang', async () => {
    const { code } = await lint('#!/bin/bash\n')
    expect(code).toBe(0)
  })

  it('correctly identifies column number of unquoted var', async () => {
    const { result } = await lint('#!/bin/bash\necho $name\n')
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue).toBeDefined()
    expect(issue.column).toBe(6) // $name starts at column 6
  })
})
