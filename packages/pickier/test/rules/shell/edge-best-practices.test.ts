import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

async function lintRule(content: string, rule: string) {
  const tempPath = createTempFile(content)
  const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [rule]: 'error' }) }
  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }
  try {
    const code = await runLint([tempPath], options)
    return { code, result: JSON.parse(output), tempPath }
  }
  finally { console.log = originalLog }
}

async function lintFixRule(content: string, rule: string) {
  const tempPath = createTempFile(content)
  const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ [rule]: 'error' }), fix: true }
  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }
  try {
    await runLint([tempPath], options)
    return readFileSync(tempPath, 'utf8')
  }
  finally { console.log = originalLog }
}

// ─── shell/prefer-double-brackets ───────────────────────────────────

describe('shell/prefer-double-brackets — exhaustive edge cases', () => {
  const RULE = 'shell/prefer-double-brackets'

  it('flags [ ] in bash script', async () => {
    const { code, result } = await lintRule('#!/bin/bash\nif [ -f "file" ]; then echo ok; fi\n', RULE)
    expect(code).toBe(1)
    expect(result.issues.some((i: any) => i.ruleId === RULE)).toBe(true)
  })

  it('flags [ ] in zsh script', async () => {
    const { code } = await lintRule('#!/bin/zsh\nif [ -f "file" ]; then echo ok; fi\n', RULE)
    expect(code).toBe(1)
  })

  it('flags [ ] with env bash shebang', async () => {
    const { code } = await lintRule('#!/usr/bin/env bash\nif [ -f "file" ]; then echo ok; fi\n', RULE)
    expect(code).toBe(1)
  })

  it('does NOT flag [ ] in POSIX sh', async () => {
    const { code } = await lintRule('#!/bin/sh\nif [ -f "file" ]; then echo ok; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('does NOT flag [ ] in env sh', async () => {
    const { code } = await lintRule('#!/usr/bin/env sh\nif [ -f "file" ]; then echo ok; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('allows [[ ]]', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [[ -f "file" ]]; then echo ok; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in comment', async () => {
    const { code } = await lintRule('#!/bin/bash\n# if [ -f "file" ]\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\nif [ -f "file" ]; then echo ok; fi\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag with no shebang (.sh extension implies POSIX-unknown)', async () => {
    // No shebang — could be either sh or bash. Rule checks first line for bash/zsh
    const { code } = await lintRule('if [ -f "file" ]; then echo ok; fi\n', RULE)
    // Without bash/zsh shebang, should not flag (defaults to POSIX-safe)
    expect(code).toBe(0)
  })

  it('fixes [ ] to [[ ]] in bash', async () => {
    const fixed = await lintFixRule('#!/bin/bash\nif [ -f "file" ]; then echo ok; fi\n', RULE)
    expect(fixed).toContain('[[ -f "file" ]]')
  })

  it('fixer does not modify POSIX sh scripts', async () => {
    const input = '#!/bin/sh\nif [ -f "file" ]; then echo ok; fi\n'
    const fixed = await lintFixRule(input, RULE)
    expect(fixed).toContain('[ -f "file" ]')
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/set-options ──────────────────────────────────────────────

describe('shell/set-options — exhaustive edge cases', () => {
  const RULE = 'shell/set-options'

  it('flags missing all options', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "hello"\n', RULE)
    expect(code).toBe(1)
  })

  it('allows set -euo pipefail (combined)', async () => {
    const { code } = await lintRule('#!/bin/bash\nset -euo pipefail\necho "hello"\n', RULE)
    expect(code).toBe(0)
  })

  it('allows separate set commands', async () => {
    const { code } = await lintRule('#!/bin/bash\nset -e\nset -u\nset -o pipefail\necho "hello"\n', RULE)
    expect(code).toBe(0)
  })

  it('flags partial set (missing pipefail)', async () => {
    const { code, result } = await lintRule('#!/bin/bash\nset -eu\necho "hello"\n', RULE)
    expect(code).toBe(1)
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue.message).toContain('pipefail')
  })

  it('flags partial set (missing -u)', async () => {
    const { code, result } = await lintRule('#!/bin/bash\nset -e\nset -o pipefail\necho "hello"\n', RULE)
    expect(code).toBe(1)
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue.message).toContain('-u')
  })

  it('flags partial set (missing -e)', async () => {
    const { code, result } = await lintRule('#!/bin/bash\nset -u\nset -o pipefail\necho "hello"\n', RULE)
    expect(code).toBe(1)
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue.message).toContain('-e')
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0) // empty file has no issues
  })

  it('issue reported on line after shebang', async () => {
    const { result } = await lintRule('#!/bin/bash\necho "hello"\n', RULE)
    const issue = result.issues.find((i: any) => i.ruleId === RULE)
    expect(issue.line).toBe(2) // line after shebang
  })
})

// ─── shell/prefer-printf ────────────────────────────────────────────

describe('shell/prefer-printf — exhaustive edge cases', () => {
  const RULE = 'shell/prefer-printf'

  it('flags echo -e', async () => {
    const { code } = await lintRule('#!/bin/bash\necho -e "hello\\nworld"\n', RULE)
    expect(code).toBe(1)
  })

  it('flags echo -n', async () => {
    const { code } = await lintRule('#!/bin/bash\necho -n "no newline"\n', RULE)
    expect(code).toBe(1)
  })

  it('flags echo -en', async () => {
    const { code } = await lintRule('#!/bin/bash\necho -en "both"\n', RULE)
    expect(code).toBe(1)
  })

  it('flags echo -ne', async () => {
    const { code } = await lintRule('#!/bin/bash\necho -ne "both reversed"\n', RULE)
    expect(code).toBe(1)
  })

  it('allows plain echo', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "hello"\n', RULE)
    expect(code).toBe(0)
  })

  it('allows echo without args', async () => {
    const { code } = await lintRule('#!/bin/bash\necho\n', RULE)
    expect(code).toBe(0)
  })

  it('allows printf', async () => {
    const { code } = await lintRule('#!/bin/bash\nprintf "hello\\n"\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in comment', async () => {
    const { code } = await lintRule('#!/bin/bash\n# echo -e "test"\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\necho -e "test"\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/no-broken-redirect ───────────────────────────────────────

describe('shell/no-broken-redirect — exhaustive edge cases', () => {
  const RULE = 'shell/no-broken-redirect'

  it('flags 2>&1 > file', async () => {
    const { code } = await lintRule('#!/bin/bash\ncmd 2>&1 > output.log\n', RULE)
    expect(code).toBe(1)
  })

  it('flags 2>&1 > file with path', async () => {
    const { code } = await lintRule('#!/bin/bash\nmake 2>&1 > /tmp/build.log\n', RULE)
    expect(code).toBe(1)
  })

  it('allows > file 2>&1 (correct order)', async () => {
    const { code } = await lintRule('#!/bin/bash\ncmd > output.log 2>&1\n', RULE)
    expect(code).toBe(0)
  })

  it('allows &> file (bash shorthand)', async () => {
    const { code } = await lintRule('#!/bin/bash\ncmd &> output.log\n', RULE)
    expect(code).toBe(0)
  })

  it('allows >> file 2>&1', async () => {
    const { code } = await lintRule('#!/bin/bash\ncmd >> output.log 2>&1\n', RULE)
    expect(code).toBe(0)
  })

  it('allows 2>&1 alone (redirect stderr to stdout)', async () => {
    const { code } = await lintRule('#!/bin/bash\ncmd 2>&1\n', RULE)
    expect(code).toBe(0)
  })

  it('allows 2>&1 | tee (pipe not redirect)', async () => {
    const { code } = await lintRule('#!/bin/bash\ncmd 2>&1 | tee output.log\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in comment', async () => {
    const { code } = await lintRule('#!/bin/bash\n# cmd 2>&1 > file\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\ncmd 2>&1 > file\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/heredoc-indent ───────────────────────────────────────────

describe('shell/heredoc-indent — exhaustive edge cases', () => {
  const RULE = 'shell/heredoc-indent'

  it('flags << in indented block', async () => {
    const { code, result } = await lintRule('#!/bin/bash\nmy_func() {\n  cat <<EOF\nhello\nEOF\n}\n', RULE)
    expect(code).toBe(1)
    expect(result.issues.some((i: any) => i.ruleId === RULE)).toBe(true)
  })

  it('flags << inside if block', async () => {
    const { code } = await lintRule('#!/bin/bash\nif true; then\n  cat <<EOF\nhello\nEOF\nfi\n', RULE)
    expect(code).toBe(1)
  })

  it('allows <<- in indented block', async () => {
    const { code } = await lintRule('#!/bin/bash\nmy_func() {\n  cat <<-EOF\n\thello\n\tEOF\n}\n', RULE)
    expect(code).toBe(0)
  })

  it('allows << at top level', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\nhello\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('flags << with quoted delimiter in indented block', async () => {
    const { code } = await lintRule("#!/bin/bash\nmy_func() {\n  cat <<'EOF'\nhello\nEOF\n}\n", RULE)
    expect(code).toBe(1)
  })

  it('allows <<- with quoted delimiter', async () => {
    const { code } = await lintRule("#!/bin/bash\nmy_func() {\n  cat <<-'EOF'\n\thello\n\tEOF\n}\n", RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/consistent-case-terminators ──────────────────────────────

describe('shell/consistent-case-terminators — exhaustive edge cases', () => {
  const RULE = 'shell/consistent-case-terminators'

  it('allows properly terminated case branches', async () => {
    const { code } = await lintRule('#!/bin/bash\ncase "$1" in\n  a)\n    echo "a"\n  ;;\n  b)\n    echo "b"\n  ;;\nesac\n', RULE)
    expect(code).toBe(0)
  })

  it('allows one-liner case branches with ;;', async () => {
    const { code } = await lintRule('#!/bin/bash\ncase "$1" in\n  a) echo "a";;\n  b) echo "b";;\nesac\n', RULE)
    expect(code).toBe(0)
  })

  it('allows last branch before esac without ;;', async () => {
    const { code } = await lintRule('#!/bin/bash\ncase "$1" in\n  a)\n    echo "a"\n  ;;\n  *)\n    echo "default"\nesac\n', RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })

  it('handles file with no case statement', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "no case here"\n', RULE)
    expect(code).toBe(0)
  })
})
