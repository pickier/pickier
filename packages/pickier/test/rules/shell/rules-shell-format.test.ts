import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { formatCode } from '../../../src/format'
import { config as defaultConfig } from '../../../src/config'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── Shell formatting integration ─────────────────────────────────────

describe('shell formatting', () => {
  it('normalizes indentation for if/then/fi blocks', () => {
    const input = [
      '#!/bin/bash',
      'if [[ -f file ]]; then',
      'echo "found"',
      'fi',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    const lines = result.split('\n')
    expect(lines[0]).toBe('#!/bin/bash')
    expect(lines[1]).toBe('if [[ -f file ]]; then')
    expect(lines[2]).toBe('  echo "found"')
    expect(lines[3]).toBe('fi')
  })

  it('normalizes indentation for nested blocks', () => {
    const input = [
      '#!/bin/bash',
      'if [[ true ]]; then',
      'if [[ false ]]; then',
      'echo "nested"',
      'fi',
      'fi',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    const lines = result.split('\n')
    expect(lines[2]).toBe('  if [[ false ]]; then')
    expect(lines[3]).toBe('    echo "nested"')
    expect(lines[4]).toBe('  fi')
    expect(lines[5]).toBe('fi')
  })

  it('normalizes indentation for function bodies', () => {
    const input = [
      '#!/bin/bash',
      'my_func() {',
      'echo "inside"',
      'return 0',
      '}',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    const lines = result.split('\n')
    expect(lines[1]).toBe('my_func() {')
    expect(lines[2]).toBe('  echo "inside"')
    expect(lines[3]).toBe('  return 0')
    expect(lines[4]).toBe('}')
  })

  it('normalizes indentation for while/do/done', () => {
    const input = [
      '#!/bin/bash',
      'while true; do',
      'echo "loop"',
      'break',
      'done',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    const lines = result.split('\n')
    expect(lines[1]).toBe('while true; do')
    expect(lines[2]).toBe('  echo "loop"')
    expect(lines[3]).toBe('  break')
    expect(lines[4]).toBe('done')
  })

  it('normalizes indentation for for/do/done', () => {
    const input = [
      '#!/bin/bash',
      'for i in 1 2 3; do',
      'echo "$i"',
      'done',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    const lines = result.split('\n')
    expect(lines[1]).toBe('for i in 1 2 3; do')
    expect(lines[2]).toBe('  echo "$i"')
    expect(lines[3]).toBe('done')
  })

  it('normalizes indentation for case/esac', () => {
    const input = [
      '#!/bin/bash',
      'case "$1" in',
      'start)',
      'echo "starting"',
      ';;',
      'stop)',
      'echo "stopping"',
      ';;',
      'esac',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    const lines = result.split('\n')
    expect(lines[1]).toBe('case "$1" in')
    expect(lines[2]).toBe('  start)')
    expect(lines[3]).toBe('    echo "starting"')
    // ;; should decrease indent
    expect(lines[4]).toBe('  ;;')
    expect(lines[5]).toBe('  stop)')
  })

  it('trims trailing whitespace', () => {
    const input = '#!/bin/bash\necho "hello"   \nls -la\t\n'
    const result = formatCode(input, defaultConfig, 'test.sh')
    expect(result).not.toContain('   \n')
    expect(result).not.toContain('\t\n')
  })

  it('preserves heredoc content unchanged', () => {
    const input = [
      '#!/bin/bash',
      'cat <<EOF',
      '  this has custom indentation',
      '    and should not change',
      'EOF',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    expect(result).toContain('  this has custom indentation')
    expect(result).toContain('    and should not change')
  })

  it('handles if/elif/else/fi correctly', () => {
    const input = [
      '#!/bin/bash',
      'if [[ "$1" == "a" ]]; then',
      'echo "a"',
      'elif [[ "$1" == "b" ]]; then',
      'echo "b"',
      'else',
      'echo "other"',
      'fi',
      '',
    ].join('\n')

    const result = formatCode(input, defaultConfig, 'test.sh')
    const lines = result.split('\n')
    expect(lines[1]).toBe('if [[ "$1" == "a" ]]; then')
    expect(lines[2]).toBe('  echo "a"')
    // elif should be at same level as if
    expect(lines[3]).toMatch(/^elif/)
    expect(lines[4]).toBe('  echo "b"')
    // else at same level as if
    expect(lines[5]).toMatch(/^else/)
    expect(lines[6]).toBe('  echo "other"')
    expect(lines[7]).toBe('fi')
  })

  it('ensures final newline', () => {
    const input = '#!/bin/bash\necho "hello"'
    const result = formatCode(input, defaultConfig, 'test.sh')
    expect(result.endsWith('\n')).toBe(true)
  })

  it('collapses multiple blank lines', () => {
    const input = '#!/bin/bash\n\n\n\necho "hello"\n'
    const result = formatCode(input, defaultConfig, 'test.sh')
    // Should not have more than 1 consecutive blank line
    expect(result).not.toContain('\n\n\n')
  })

  it('detects shell files by shebang when extension is not .sh', () => {
    const input = [
      '#!/usr/bin/env bash',
      'if true; then',
      'echo "detected"',
      'fi',
      '',
    ].join('\n')

    // Even with a non-shell extension, should detect via shebang
    const result = formatCode(input, defaultConfig, 'my-script')
    // The shell formatting should kick in if shebang is detected
    // However, the file won't be picked up by glob — this tests the format engine only
    expect(result).toContain('#!/usr/bin/env bash')
  })
})

// ─── shell/indent rule integration ────────────────────────────────────

describe('shell/indent', () => {
  it('flags incorrect indentation', async () => {
    const content = '#!/bin/bash\nif [[ true ]]; then\n    echo "wrong indent"\nfi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/indent': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/indent')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('accepts correct 2-space indentation', async () => {
    const content = '#!/bin/bash\nif [[ true ]]; then\n  echo "correct"\nfi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/indent': 'error' })
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

  it('fixes indentation', async () => {
    const content = '#!/bin/bash\nif [[ true ]]; then\n    echo "wrong"\nfi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/indent': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      const fixed = readFileSync(tempPath, 'utf8')
      expect(fixed).toContain('  echo "wrong"')
    }
    finally {
      console.log = originalLog
    }
  })
})
