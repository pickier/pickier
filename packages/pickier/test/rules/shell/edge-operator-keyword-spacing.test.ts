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

// ─── shell/operator-spacing ─────────────────────────────────────────

describe('shell/operator-spacing — exhaustive edge cases', () => {
  const RULE = 'shell/operator-spacing'

  // ─── Should flag ──────────────────────────────────────────────
  it('flags [[ without space after', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [[-z "$var" ]]; then echo ok; fi\n', RULE)
    expect(code).toBe(1)
  })

  it('flags ]] without space before', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [[ -z "$var"]]; then echo ok; fi\n', RULE)
    expect(code).toBe(1)
  })

  it('flags [ without space after', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [-z "$var" ]; then echo ok; fi\n', RULE)
    expect(code).toBe(1)
  })

  it('flags ] without space before', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [ -z "$var"]; then echo ok; fi\n', RULE)
    expect(code).toBe(1)
  })

  it('flags both sides missing in [[]]', async () => {
    const { result } = await lintRule('#!/bin/bash\nif [[-z "$var"]]; then echo ok; fi\n', RULE)
    const issues = result.issues.filter((i: any) => i.ruleId === RULE)
    expect(issues.length).toBeGreaterThanOrEqual(2)
  })

  // ─── Should NOT flag ──────────────────────────────────────────
  it('allows [[ with proper spacing', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [[ -z "$var" ]]; then echo ok; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('allows [ with proper spacing', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [ -z "$var" ]; then echo ok; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in comments', async () => {
    const { code } = await lintRule('#!/bin/bash\n# [[-z "$var"]]\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\n[[-z "$var"]]\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  // ─── Fixer ────────────────────────────────────────────────────
  it('fixes [[ spacing', async () => {
    const fixed = await lintFixRule('#!/bin/bash\nif [[-z "$var"]]; then echo ok; fi\n', RULE)
    expect(fixed).toContain('[[ -z')
    expect(fixed).toContain(' ]]')
  })

  it('fixes [ ] spacing', async () => {
    const fixed = await lintFixRule('#!/bin/bash\nif [-z "$var"]; then echo ok; fi\n', RULE)
    expect(fixed).toContain('[ -z')
    expect(fixed).toContain(' ]')
  })

  it('fixer is idempotent', async () => {
    const first = await lintFixRule('#!/bin/bash\nif [[-z "$var"]]; then echo ok; fi\n', RULE)
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
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/keyword-spacing ──────────────────────────────────────────

describe('shell/keyword-spacing — exhaustive edge cases', () => {
  const RULE = 'shell/keyword-spacing'

  it('flags ;then (no space after ;)', async () => {
    const { code, result } = await lintRule('#!/bin/bash\nif true;then echo ok; fi\n', RULE)
    expect(code).toBe(1)
    expect(result.issues.some((i: any) => i.ruleId === RULE)).toBe(true)
  })

  it('flags ;do (no space after ;)', async () => {
    const { code } = await lintRule('#!/bin/bash\nwhile true;do echo loop; done\n', RULE)
    expect(code).toBe(1)
  })

  it('allows ; then (with space)', async () => {
    const { code } = await lintRule('#!/bin/bash\nif true; then echo ok; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('allows ; do (with space)', async () => {
    const { code } = await lintRule('#!/bin/bash\nwhile true; do echo loop; done\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag ;; (case terminator)', async () => {
    const { code } = await lintRule('#!/bin/bash\ncase "$1" in\n  a)\n    echo "a";;\nesac\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in comments', async () => {
    const { code } = await lintRule('#!/bin/bash\n# if true;then\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\nif true;then\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/no-trailing-semicolons ───────────────────────────────────

describe('shell/no-trailing-semicolons — exhaustive edge cases', () => {
  const RULE = 'shell/no-trailing-semicolons'

  it('flags trailing ; on simple command', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "hello";\n', RULE)
    expect(code).toBe(1)
  })

  it('flags trailing ; on ls', async () => {
    const { code } = await lintRule('#!/bin/bash\nls -la;\n', RULE)
    expect(code).toBe(1)
  })

  it('allows ;; case terminator', async () => {
    const { code } = await lintRule('#!/bin/bash\ncase "$1" in\n  a)\n    echo "a"\n  ;;\nesac\n', RULE)
    expect(code).toBe(0)
  })

  it('allows ; then', async () => {
    const { code } = await lintRule('#!/bin/bash\nif true; then\n  echo "ok"\nfi\n', RULE)
    expect(code).toBe(0)
  })

  it('allows ; do', async () => {
    const { code } = await lintRule('#!/bin/bash\nfor i in 1 2; do\n  echo "$i"\ndone\n', RULE)
    expect(code).toBe(0)
  })

  it('allows ; else', async () => {
    const { code } = await lintRule('#!/bin/bash\nif true; then echo a; else echo b; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('allows for loop with ; in header', async () => {
    const { code } = await lintRule('#!/bin/bash\nfor i in 1 2 3; do echo "$i"; done\n', RULE)
    expect(code).toBe(0)
  })

  it('allows while loop', async () => {
    const { code } = await lintRule('#!/bin/bash\nwhile read -r line; do echo "$line"; done\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in comment', async () => {
    const { code } = await lintRule('#!/bin/bash\n# echo "hello";\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\necho "hello";\nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('fixes trailing semicolons', async () => {
    const fixed = await lintFixRule('#!/bin/bash\necho "hello";\nls;\n', RULE)
    expect(fixed).not.toMatch(/echo "hello";/)
    expect(fixed).not.toMatch(/ls;/)
  })

  it('fixer preserves ;; in case', async () => {
    const input = '#!/bin/bash\ncase "$1" in\n  a)\n    echo "a";;\nesac\n'
    const fixed = await lintFixRule(input, RULE)
    expect(fixed).toContain(';;')
  })

  it('handles empty file', async () => {
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})

// ─── shell/no-trailing-whitespace ───────────────────────────────────

describe('shell/no-trailing-whitespace — exhaustive edge cases', () => {
  const RULE = 'shell/no-trailing-whitespace'

  it('flags trailing spaces', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "ok"   \n', RULE)
    expect(code).toBe(1)
  })

  it('flags trailing tabs', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "ok"\t\t\n', RULE)
    expect(code).toBe(1)
  })

  it('flags trailing mixed whitespace', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "ok" \t \n', RULE)
    expect(code).toBe(1)
  })

  it('does not flag clean lines', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "ok"\nls -la\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag empty lines', async () => {
    const { code } = await lintRule('#!/bin/bash\n\necho "ok"\n', RULE)
    expect(code).toBe(0)
  })

  it('ignores trailing whitespace in heredoc', async () => {
    const { code } = await lintRule('#!/bin/bash\ncat <<EOF\nline with spaces   \nEOF\n', RULE)
    expect(code).toBe(0)
  })

  it('fixes trailing whitespace', async () => {
    const fixed = await lintFixRule('#!/bin/bash\necho "ok"   \nls\t\n', RULE)
    expect(fixed).not.toMatch(/[ \t]\n/)
  })

  it('fixer is idempotent', async () => {
    const first = await lintFixRule('#!/bin/bash\necho "ok"   \n', RULE)
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
    const { code } = await lintRule('', RULE)
    expect(code).toBe(0)
  })
})
