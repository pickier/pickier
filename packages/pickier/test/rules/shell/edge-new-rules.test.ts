import { afterEach, describe, expect, it } from 'bun:test'
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

// ─── shell/no-ls-parsing ────────────────────────────────────────────

describe('shell/no-ls-parsing — exhaustive edge cases', () => {
  const RULE = 'shell/no-ls-parsing'

  // ─── Should flag ──────────────────────────────────────────────
  it('flags ls | while', async () => {
    const { code } = await lintRule('#!/bin/bash\nls | while read -r f; do echo "$f"; done\n', RULE)
    expect(code).toBe(1)
  })

  it('flags ls -la | grep', async () => {
    const { code } = await lintRule('#!/bin/bash\nls -la | grep ".txt"\n', RULE)
    expect(code).toBe(1)
  })

  it('flags ls -1 | wc', async () => {
    const { code } = await lintRule('#!/bin/bash\nls -1 | wc -l\n', RULE)
    expect(code).toBe(1)
  })

  it('flags ls /dir | cmd', async () => {
    const { code } = await lintRule('#!/bin/bash\nls /tmp | head -5\n', RULE)
    expect(code).toBe(1)
  })

  it('flags $(ls) in command substitution', async () => {
    const { code, result } = await lintRule('#!/bin/bash\nfor f in $(ls); do echo "$f"; done\n', RULE)
    expect(code).toBe(1)
    expect(result.issues.some((i: any) => i.ruleId === RULE)).toBe(true)
  })

  it('flags $(ls *.txt)', async () => {
    const { code } = await lintRule('#!/bin/bash\nfiles=$(ls *.txt)\n', RULE)
    expect(code).toBe(1)
  })

  it('flags backtick ls', async () => {
    const { code } = await lintRule('#!/bin/bash\nfor f in `ls`; do echo "$f"; done\n', RULE)
    expect(code).toBe(1)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows ls alone (display to terminal)', async () => {
    const { code } = await lintRule('#!/bin/bash\nls\n', RULE)
    expect(code).toBe(0)
  })

  it('allows ls -la alone', async () => {
    const { code } = await lintRule('#!/bin/bash\nls -la\n', RULE)
    expect(code).toBe(0)
  })

  it('allows ls > file (redirect, not pipe-parsing)', async () => {
    const { code } = await lintRule('#!/bin/bash\nls > files.txt\n', RULE)
    expect(code).toBe(0)
  })

  it('allows glob-based iteration (safe alternative)', async () => {
    const { code } = await lintRule('#!/bin/bash\nfor f in *.txt; do echo "$f"; done\n', RULE)
    expect(code).toBe(0)
  })

  it('allows find instead of ls', async () => {
    const { code } = await lintRule('#!/bin/bash\nfind . -name "*.txt" | while read -r f; do echo "$f"; done\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores ls in comment', async () => {
    const { code } = await lintRule('#!/bin/bash\n# ls | grep pattern\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores ls in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\nls | grep pattern\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag lsof (different command)', async () => {
    const { code } = await lintRule('#!/bin/bash\nlsof | grep "8080"\n', RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/no-variable-in-single-quotes ─────────────────────────────

describe('shell/no-variable-in-single-quotes — exhaustive edge cases', () => {
  const RULE = 'shell/no-variable-in-single-quotes'

  // ─── Should flag ──────────────────────────────────────────────
  it('flags $HOME in single quotes', async () => {
    const { code, result } = await lintRule("#!/bin/bash\necho '$HOME'\n", RULE)
    expect(code).toBe(1)
    expect(result.issues[0].ruleId).toBe(RULE)
    expect(result.issues[0].message).toContain('$HOME')
  })

  it('flags ${var} in single quotes', async () => {
    const { code } = await lintRule("#!/bin/bash\necho '${USER}'\n", RULE)
    expect(code).toBe(1)
  })

  it('flags $(cmd) in single quotes', async () => {
    const { code } = await lintRule("#!/bin/bash\necho '$(date)'\n", RULE)
    expect(code).toBe(1)
  })

  it('flags $var in mid-string single quotes', async () => {
    const { code } = await lintRule("#!/bin/bash\necho 'Hello $USER, welcome'\n", RULE)
    expect(code).toBe(1)
  })

  it('flags multiple vars in single quotes (reports first)', async () => {
    const { code, result } = await lintRule("#!/bin/bash\necho '$HOME is $USER home'\n", RULE)
    expect(code).toBe(1)
    // Reports the first variable found
    expect(result.issues.length).toBeGreaterThanOrEqual(1)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows $var in double quotes (will expand)', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "$HOME"\n', RULE)
    expect(code).toBe(0)
  })

  it('allows literal text in single quotes', async () => {
    const { code } = await lintRule("#!/bin/bash\necho 'no variables here'\n", RULE)
    expect(code).toBe(0)
  })

  it('allows regex in single quotes (intentional literal)', async () => {
    const { code } = await lintRule("#!/bin/bash\ngrep 'pattern' file.txt\n", RULE)
    expect(code).toBe(0)
  })

  it('allows dollar sign without var name in single quotes', async () => {
    const { code } = await lintRule("#!/bin/bash\necho 'costs $5'\n", RULE)
    expect(code).toBe(0)
  })

  it('ignores single quotes in comment', async () => {
    const { code } = await lintRule("#!/bin/bash\n# echo '$HOME'\n", RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule("#!/bin/bash\ncat <<EOF\necho '$HOME'\nEOF\n", RULE)
    expect(code).toBe(0)
  })

  it('does not flag dollar inside double quotes around single quotes', async () => {
    // "it's $HOME" — the $HOME is in double quotes, not single
    const { code } = await lintRule('#!/bin/bash\necho "it\'s $HOME"\n', RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })

  it('handles file with no single quotes', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "no single quotes"\n', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/no-exit-in-subshell ──────────────────────────────────────

describe('shell/no-exit-in-subshell — exhaustive edge cases', () => {
  const RULE = 'shell/no-exit-in-subshell'

  // ─── Should flag ──────────────────────────────────────────────
  it('flags exit in single-line subshell', async () => {
    const { code, result } = await lintRule('#!/bin/bash\n(cd /dir && exit 1)\n', RULE)
    expect(code).toBe(1)
    expect(result.issues.some((i: any) => i.ruleId === RULE)).toBe(true)
  })

  it('flags exit in multi-line subshell', async () => {
    const content = '#!/bin/bash\n(\n  cd /dir\n  exit 1\n)\n'
    const { code } = await lintRule(content, RULE)
    expect(code).toBe(1)
  })

  it('flags exit inside subshell in function', async () => {
    const content = '#!/bin/bash\nfoo() {\n  (exit 1)\n}\n'
    const { code } = await lintRule(content, RULE)
    expect(code).toBe(1)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows exit at top level', async () => {
    const { code } = await lintRule('#!/bin/bash\nexit 0\n', RULE)
    expect(code).toBe(0)
  })

  it('allows exit in function (not subshell)', async () => {
    const { code } = await lintRule('#!/bin/bash\nfoo() {\n  exit 1\n}\n', RULE)
    expect(code).toBe(0)
  })

  it('allows exit in if block (not subshell)', async () => {
    const { code } = await lintRule('#!/bin/bash\nif false; then\n  exit 1\nfi\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag $() as subshell (it is command substitution)', async () => {
    const { code } = await lintRule('#!/bin/bash\nresult=$(exit 1)\n', RULE)
    // $() is command substitution, not subshell grouping — still safe to flag
    // but our rule specifically checks for `(` not preceded by `$`
    expect(code).toBe(0)
  })

  it('does not flag (( )) as subshell (arithmetic)', async () => {
    const { code } = await lintRule('#!/bin/bash\n(( x = 1 ))\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores exit in comment', async () => {
    const { code } = await lintRule('#!/bin/bash\n# (exit 1)\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\n(exit 1)\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })

  it('handles file with no exit or subshell', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "safe"\n', RULE)
    expect(code).toBe(0)
  })
})
