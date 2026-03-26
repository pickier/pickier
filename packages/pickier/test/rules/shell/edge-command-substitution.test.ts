import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/command-substitution'
const cfg = (sev: string = 'error') => createConfigWithShellRules({ [RULE]: sev })

async function lint(content: string, opts: Partial<LintOptions> = {}) {
  const tempPath = createTempFile(content)
  const options: LintOptions = { reporter: 'json', config: cfg(), ...opts }
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
  const options: LintOptions = { reporter: 'json', config: cfg(), fix: true }
  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }
  try {
    await runLint([tempPath], options)
    return readFileSync(tempPath, 'utf8')
  }
  finally { console.log = originalLog }
}

describe('shell/command-substitution — exhaustive edge cases', () => {
  // ─── Basic detection ──────────────────────────────────────────
  it('flags simple backtick usage', async () => {
    const { code, result } = await lint('#!/bin/bash\nresult=`ls`\n')
    expect(code).toBe(1)
    expect(result.issues[0].ruleId).toBe(RULE)
  })

  it('flags backtick with flags', async () => {
    const { code } = await lint('#!/bin/bash\nresult=`ls -la --color`\n')
    expect(code).toBe(1)
  })

  it('flags backtick in echo', async () => {
    const { code } = await lint('#!/bin/bash\necho `date`\n')
    expect(code).toBe(1)
  })

  it('flags backtick in variable assignment', async () => {
    const { code } = await lint('#!/bin/bash\nVAR=`whoami`\n')
    expect(code).toBe(1)
  })

  it('flags backtick inside double quotes', async () => {
    const { code } = await lint('#!/bin/bash\necho "user is `whoami`"\n')
    expect(code).toBe(1)
  })

  it('flags multiple backtick expressions on one line', async () => {
    const { result } = await lint('#!/bin/bash\necho `date` `whoami`\n')
    expect(result.issues.filter((i: any) => i.ruleId === RULE).length).toBe(2)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows $() notation', async () => {
    const { code } = await lint('#!/bin/bash\nresult=$(ls -la)\n')
    expect(code).toBe(0)
  })

  it('allows nested $() notation', async () => {
    const { code } = await lint('#!/bin/bash\nresult=$(echo $(date))\n')
    expect(code).toBe(0)
  })

  it('ignores backticks inside single quotes', async () => {
    const { code } = await lint("#!/bin/bash\necho 'this is `not` a substitution'\n")
    expect(code).toBe(0)
  })

  it('ignores backticks in comment lines', async () => {
    const { code } = await lint('#!/bin/bash\n# Use `cmd` for info\n')
    expect(code).toBe(0)
  })

  it('ignores backticks in inline comments', async () => {
    const { code } = await lint('#!/bin/bash\necho "ok" # see `man bash`\n')
    expect(code).toBe(0)
  })

  it('ignores backticks inside heredoc', async () => {
    const { code } = await lint('#!/bin/bash\ncat <<EOF\nthis has `backticks`\nEOF\n')
    expect(code).toBe(0)
  })

  it('ignores backticks inside quoted heredoc', async () => {
    const { code } = await lint("#!/bin/bash\ncat <<'EOF'\nthis has `backticks`\nEOF\n")
    expect(code).toBe(0)
  })

  it('ignores escaped backtick', async () => {
    const { code } = await lint('#!/bin/bash\necho "literal \\`backtick\\`"\n')
    expect(code).toBe(0)
  })

  // ─── Heredoc boundary precision ───────────────────────────────
  it('resumes checking after heredoc ends', async () => {
    const { code, result } = await lint('#!/bin/bash\ncat <<EOF\nsafe `here`\nEOF\nresult=`ls`\n')
    expect(code).toBe(1)
    expect(result.issues.length).toBe(1)
    expect(result.issues[0].line).toBe(5) // after heredoc
  })

  it('handles multiple heredocs', async () => {
    const { code } = await lint('#!/bin/bash\ncat <<A\n`safe`\nA\ncat <<B\n`safe`\nB\n')
    expect(code).toBe(0)
  })

  // ─── Fixer tests ──────────────────────────────────────────────
  it('fixes simple backtick to $()', async () => {
    const fixed = await lintFix('#!/bin/bash\nresult=`ls -la`\n')
    expect(fixed).toContain('$(ls -la)')
    expect(fixed).not.toContain('`ls -la`')
  })

  it('fixes multiple backticks on one line', async () => {
    const fixed = await lintFix('#!/bin/bash\necho `date` `whoami`\n')
    expect(fixed).toContain('$(date)')
    expect(fixed).toContain('$(whoami)')
  })

  it('fixer preserves single-quoted backticks', async () => {
    const fixed = await lintFix("#!/bin/bash\necho 'keep `this`' `fix_this`\n")
    expect(fixed).toContain("'keep `this`'")
    expect(fixed).toContain('$(fix_this)')
  })

  it('fixer preserves comment backticks', async () => {
    const fixed = await lintFix('#!/bin/bash\n# keep `this`\nresult=`fix`\n')
    expect(fixed).toContain('# keep `this`')
    expect(fixed).toContain('$(fix)')
  })

  it('fixer preserves heredoc backticks', async () => {
    const fixed = await lintFix('#!/bin/bash\ncat <<EOF\n`keep`\nEOF\nresult=`fix`\n')
    expect(fixed).toContain('`keep`')
    expect(fixed).toContain('$(fix)')
  })

  it('fixer is idempotent (running twice produces same result)', async () => {
    const first = await lintFix('#!/bin/bash\nresult=`ls`\n')
    const tempPath = createTempFile(first)
    const options: LintOptions = { reporter: 'json', config: cfg(), fix: true }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      await runLint([tempPath], options)
      const second = readFileSync(tempPath, 'utf8')
      expect(second).toBe(first)
    }
    finally { console.log = originalLog }
  })

  // ─── File extension variants ──────────────────────────────────
  it('works with .bash extension', async () => {
    const tempPath = createTempFile('#!/bin/bash\nresult=`ls`\n', '.bash')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
    }
    finally { console.log = originalLog }
  })

  it('works with .zsh extension', async () => {
    const tempPath = createTempFile('#!/bin/zsh\nresult=`ls`\n', '.zsh')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
    }
    finally { console.log = originalLog }
  })

  // ─── Severity ─────────────────────────────────────────────────
  it('respects warn severity (exit code 0)', async () => {
    const tempPath = createTempFile('#!/bin/bash\nresult=`ls`\n')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'warn' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0) // warnings don't fail
    }
    finally { console.log = originalLog }
  })

  it('respects off severity (no issues)', async () => {
    const tempPath = createTempFile('#!/bin/bash\nresult=`ls`\n')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [RULE]: 'off' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally { console.log = originalLog }
  })

  // ─── Empty / minimal files ────────────────────────────────────
  it('handles empty file', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })

  it('handles file with only shebang', async () => {
    const { code } = await lint('#!/bin/bash\n')
    expect(code).toBe(0)
  })

  it('handles file with only comments', async () => {
    const { code } = await lint('#!/bin/bash\n# just comments\n# with `backticks`\n')
    expect(code).toBe(0)
  })
})
