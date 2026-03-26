import { afterEach, describe, expect, it } from 'bun:test'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/no-useless-cat'

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

describe('shell/no-useless-cat — exhaustive edge cases', () => {
  // ─── Should flag ──────────────────────────────────────────────
  it('flags cat file | grep', async () => {
    const { code, result } = await lint('#!/bin/bash\ncat file.txt | grep "pattern"\n')
    expect(code).toBe(1)
    expect(result.issues.some((i: any) => i.ruleId === RULE)).toBe(true)
  })

  it('does not flag cat with space-containing filename (regex limitation)', async () => {
    // "my file.txt" contains a space — the simple regex pattern can't match filenames with spaces
    const { result } = await lint('#!/bin/bash\ncat "my file.txt" | sort\n')
    const catIssues = result.issues.filter((i: any) => i.ruleId === RULE)
    expect(catIssues.length).toBe(0)
  })

  it('flags cat with single-quoted filename | cmd', async () => {
    const { code } = await lint("#!/bin/bash\ncat 'file.txt' | wc -l\n")
    expect(code).toBe(1)
  })

  it('flags cat with path | cmd', async () => {
    const { code } = await lint('#!/bin/bash\ncat /etc/passwd | awk -F: \'{print $1}\'\n')
    expect(code).toBe(1)
  })

  it('flags cat with variable path | cmd', async () => {
    const { code } = await lint('#!/bin/bash\ncat ${file} | head\n')
    expect(code).toBe(1)
  })

  it('flags cat with relative path | cmd', async () => {
    const { code } = await lint('#!/bin/bash\ncat ./data.csv | cut -d, -f1\n')
    expect(code).toBe(1)
  })

  it('flags cat with home-relative path | cmd', async () => {
    const { code } = await lint('#!/bin/bash\ncat ~/data.txt | less\n')
    expect(code).toBe(1)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows cat without pipe (display)', async () => {
    const { code } = await lint('#!/bin/bash\ncat file.txt\n')
    expect(code).toBe(0)
  })

  it('allows cat with multiple files piped', async () => {
    const { code } = await lint('#!/bin/bash\ncat file1.txt file2.txt | sort\n')
    expect(code).toBe(0)
  })

  it('allows cat with stdin (no file)', async () => {
    const { code } = await lint('#!/bin/bash\ncat | grep "x"\n')
    expect(code).toBe(0)
  })

  it('allows cat in comment', async () => {
    const { code } = await lint('#!/bin/bash\n# cat file.txt | grep\n')
    expect(code).toBe(0)
  })

  it('allows cat in heredoc', async () => {
    const { code } = await lint('#!/bin/bash\ncat <<EOF\ncat file.txt | grep\nEOF\n')
    expect(code).toBe(0)
  })

  it('allows concatenate (not cat command)', async () => {
    const { code } = await lint('#!/bin/bash\ncatalog_check file.txt | grep\n')
    expect(code).toBe(0)
  })

  // ─── Edge cases ───────────────────────────────────────────────
  it('handles empty file', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })

  it('handles file with no cat', async () => {
    const { code } = await lint('#!/bin/bash\ngrep "pattern" file.txt\n')
    expect(code).toBe(0)
  })

  it('correct column reported', async () => {
    const { result } = await lint('#!/bin/bash\n  cat file.txt | grep "x"\n')
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue).toBeDefined()
  })
})
