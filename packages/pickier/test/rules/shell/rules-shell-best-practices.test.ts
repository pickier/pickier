import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── shell/prefer-double-brackets ─────────────────────────────────────

describe('shell/prefer-double-brackets', () => {
  it('flags single brackets in bash scripts', async () => {
    const content = '#!/bin/bash\nif [ -f "file.txt" ]; then\n  echo "exists"\nfi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/prefer-double-brackets': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/prefer-double-brackets')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows double brackets', async () => {
    const content = '#!/bin/bash\nif [[ -f "file.txt" ]]; then\n  echo "exists"\nfi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/prefer-double-brackets': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('does not flag single brackets in POSIX sh', async () => {
    const content = '#!/bin/sh\nif [ -f "file.txt" ]; then\n  echo "exists"\nfi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/prefer-double-brackets': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/set-options ────────────────────────────────────────────────

describe('shell/set-options', () => {
  it('flags missing set options', async () => {
    const content = '#!/bin/bash\necho "hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/set-options': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/set-options')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows set -euo pipefail', async () => {
    const content = '#!/bin/bash\nset -euo pipefail\necho "hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/set-options': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows separate set commands', async () => {
    const content = '#!/bin/bash\nset -e\nset -u\nset -o pipefail\necho "hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/set-options': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/prefer-printf ──────────────────────────────────────────────

describe('shell/prefer-printf', () => {
  it('flags echo -e', async () => {
    const content = '#!/bin/bash\necho -e "hello\\nworld"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/prefer-printf': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/prefer-printf')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('flags echo -n', async () => {
    const content = '#!/bin/bash\necho -n "no newline"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/prefer-printf': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows plain echo', async () => {
    const content = '#!/bin/bash\necho "hello world"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/prefer-printf': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows printf', async () => {
    const content = '#!/bin/bash\nprintf "hello\\nworld\\n"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/prefer-printf': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/no-broken-redirect ─────────────────────────────────────────

describe('shell/no-broken-redirect', () => {
  it('flags 2>&1 before > file', async () => {
    const content = '#!/bin/bash\ncmd 2>&1 > output.log\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-broken-redirect': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/no-broken-redirect')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows correct redirect ordering', async () => {
    const content = '#!/bin/bash\ncmd > output.log 2>&1\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-broken-redirect': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows &> shorthand', async () => {
    const content = '#!/bin/bash\ncmd &> output.log\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-broken-redirect': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/heredoc-indent ─────────────────────────────────────────────

describe('shell/heredoc-indent', () => {
  it('flags << inside indented block', async () => {
    const content = '#!/bin/bash\nmy_func() {\n  cat <<EOF\nhello world\nEOF\n}\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/heredoc-indent': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/heredoc-indent')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows <<- inside indented block', async () => {
    const content = '#!/bin/bash\nmy_func() {\n  cat <<-EOF\n\thello world\n\tEOF\n}\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/heredoc-indent': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows << at top level (not indented)', async () => {
    const content = '#!/bin/bash\ncat <<EOF\nhello world\nEOF\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/heredoc-indent': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/consistent-case-terminators ────────────────────────────────

describe('shell/consistent-case-terminators', () => {
  it('allows properly terminated case branches', async () => {
    const content = '#!/bin/bash\ncase "$1" in\n  start)\n    echo "starting"\n    ;;\n  stop)\n    echo "stopping"\n    ;;\nesac\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/consistent-case-terminators': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })
})
