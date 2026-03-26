import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── shell/command-substitution ───────────────────────────────────────

describe('shell/command-substitution', () => {
  it('flags backtick command substitution', async () => {
    const content = '#!/bin/bash\nresult=`ls -la`\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/command-substitution': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('shell/command-substitution')
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows $() command substitution', async () => {
    const content = '#!/bin/bash\nresult=$(ls -la)\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/command-substitution': 'error' })
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

  it('ignores backticks in single quotes', async () => {
    const content = '#!/bin/bash\necho \'this has `backticks` inside\'\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/command-substitution': 'error' })
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

  it('ignores backticks in comments', async () => {
    const content = '#!/bin/bash\n# this has `backticks` in a comment\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/command-substitution': 'error' })
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

  it('fixes backtick to $() substitution', async () => {
    const content = '#!/bin/bash\nresult=`ls -la`\nnested=`echo `inner``\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/command-substitution': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      const fixed = readFileSync(tempPath, 'utf8')
      expect(fixed).toContain('$(ls -la)')
      expect(fixed).not.toContain('`ls -la`')
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/quote-variables ────────────────────────────────────────────

describe('shell/quote-variables', () => {
  it('flags unquoted variable in command arguments', async () => {
    const content = '#!/bin/bash\necho $name\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/quote-variables': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/quote-variables')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows quoted variables', async () => {
    const content = '#!/bin/bash\necho "$name"\necho "${path}"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/quote-variables': 'error' })
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

  it('allows variables inside [[ ]] tests', async () => {
    const content = '#!/bin/bash\nif [[ $var == "test" ]]; then echo ok; fi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/quote-variables': 'error' })
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

// ─── shell/no-cd-without-check ────────────────────────────────────────

describe('shell/no-cd-without-check', () => {
  it('flags cd without error handling', async () => {
    const content = '#!/bin/bash\ncd /some/directory\necho "in directory"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-cd-without-check': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/no-cd-without-check')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows cd with || exit', async () => {
    const content = '#!/bin/bash\ncd /some/directory || exit 1\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-cd-without-check': 'error' })
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

  it('allows cd with && chaining', async () => {
    const content = '#!/bin/bash\ncd /dir && make build\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-cd-without-check': 'error' })
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

// ─── shell/no-eval ────────────────────────────────────────────────────

describe('shell/no-eval', () => {
  it('flags eval usage', async () => {
    const content = '#!/bin/bash\neval "echo hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-eval': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/no-eval')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('does not flag eval in comments', async () => {
    const content = '#!/bin/bash\n# eval is dangerous\necho "no eval here"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-eval': 'error' })
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

// ─── shell/no-useless-cat ─────────────────────────────────────────────

describe('shell/no-useless-cat', () => {
  it('flags cat file | cmd pattern', async () => {
    const content = '#!/bin/bash\ncat file.txt | grep "pattern"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-useless-cat': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/no-useless-cat')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows cat with multiple files', async () => {
    const content = '#!/bin/bash\ncat file1.txt file2.txt | sort\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-useless-cat': 'error' })
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

  it('allows cat without pipe (just displaying)', async () => {
    const content = '#!/bin/bash\ncat file.txt\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-useless-cat': 'error' })
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
