import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions, PickierConfig } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { formatCode } from '../../../src/format'
import { config as defaultConfig } from '../../../src/config'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

const RULE = 'shell/indent'

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

function fmt(content: string, filePath = 'test.sh'): string {
  return formatCode(content, defaultConfig, filePath)
}

describe('shell/indent — exhaustive edge cases', () => {
  // ─── Basic control structures ─────────────────────────────────
  it('accepts correct if/then/fi indentation', async () => {
    const { code } = await lint('#!/bin/bash\nif [[ true ]]; then\n  echo "ok"\nfi\n')
    expect(code).toBe(0)
  })

  it('flags wrong if/then/fi indentation', async () => {
    const { code } = await lint('#!/bin/bash\nif [[ true ]]; then\n      echo "wrong"\nfi\n')
    expect(code).toBe(1)
  })

  it('accepts correct while/do/done', async () => {
    const { code } = await lint('#!/bin/bash\nwhile true; do\n  echo "loop"\ndone\n')
    expect(code).toBe(0)
  })

  it('flags wrong while/do/done', async () => {
    const { code } = await lint('#!/bin/bash\nwhile true; do\necho "wrong"\ndone\n')
    expect(code).toBe(1)
  })

  it('accepts correct for/do/done', async () => {
    const { code } = await lint('#!/bin/bash\nfor i in 1 2 3; do\n  echo "$i"\ndone\n')
    expect(code).toBe(0)
  })

  it('accepts correct until/do/done', async () => {
    const { code } = await lint('#!/bin/bash\nuntil false; do\n  echo "loop"\ndone\n')
    expect(code).toBe(0)
  })

  // ─── Separate then/do on own line ─────────────────────────────
  it('accepts then on its own line', async () => {
    const { code } = await lint('#!/bin/bash\nif [[ true ]]\nthen\n  echo "ok"\nfi\n')
    expect(code).toBe(0)
  })

  it('accepts do on its own line', async () => {
    const { code } = await lint('#!/bin/bash\nwhile true\ndo\n  echo "loop"\ndone\n')
    expect(code).toBe(0)
  })

  // ─── Nested structures ────────────────────────────────────────
  it('accepts doubly nested if/fi', async () => {
    const content = [
      '#!/bin/bash',
      'if [[ true ]]; then',
      '  if [[ false ]]; then',
      '    echo "deep"',
      '  fi',
      'fi',
      '',
    ].join('\n')
    const { code } = await lint(content)
    expect(code).toBe(0)
  })

  it('accepts triply nested structures', async () => {
    const content = [
      '#!/bin/bash',
      'for i in 1 2 3; do',
      '  if [[ "$i" == "1" ]]; then',
      '    while true; do',
      '      echo "$i"',
      '      break',
      '    done',
      '  fi',
      'done',
      '',
    ].join('\n')
    const { code } = await lint(content)
    expect(code).toBe(0)
  })

  // ─── if/elif/else/fi ──────────────────────────────────────────
  it('accepts correct if/elif/else/fi', async () => {
    const content = [
      '#!/bin/bash',
      'if [[ "$1" == "a" ]]; then',
      '  echo "a"',
      'elif [[ "$1" == "b" ]]; then',
      '  echo "b"',
      'else',
      '  echo "other"',
      'fi',
      '',
    ].join('\n')
    const { code } = await lint(content)
    expect(code).toBe(0)
  })

  it('flags wrong elif indentation', async () => {
    const content = [
      '#!/bin/bash',
      'if [[ "$1" == "a" ]]; then',
      '  echo "a"',
      '  elif [[ "$1" == "b" ]]; then', // wrong — should be level 0
      '  echo "b"',
      'fi',
      '',
    ].join('\n')
    const { code } = await lint(content)
    expect(code).toBe(1)
  })

  // ─── Function bodies ─────────────────────────────────────────
  it('accepts correct function body indentation', async () => {
    const content = [
      '#!/bin/bash',
      'my_func() {',
      '  echo "inside"',
      '  return 0',
      '}',
      '',
    ].join('\n')
    const { code } = await lint(content)
    expect(code).toBe(0)
  })

  it('accepts function with control structures inside', async () => {
    const content = [
      '#!/bin/bash',
      'build() {',
      '  if [[ -f Makefile ]]; then',
      '    make clean',
      '    make build',
      '  else',
      '    echo "No Makefile"',
      '  fi',
      '}',
      '',
    ].join('\n')
    const { code } = await lint(content)
    expect(code).toBe(0)
  })

  // ─── Case/esac ────────────────────────────────────────────────
  it('accepts correct case/esac indentation', async () => {
    const content = [
      '#!/bin/bash',
      'case "$1" in',
      '  start)',
      '    echo "starting"',
      '  ;;',
      '  stop)',
      '    echo "stopping"',
      '  ;;',
      'esac',
      '',
    ].join('\n')
    const { code } = await lint(content)
    expect(code).toBe(0)
  })

  // ─── Heredoc preservation ─────────────────────────────────────
  it('does not flag indentation inside heredoc', async () => {
    const content = [
      '#!/bin/bash',
      'if true; then',
      '  cat <<EOF',
      'this is not indented',
      '    and this has weird indentation',
      'EOF',
      'fi',
      '',
    ].join('\n')
    // heredoc content should be skipped
    const { result } = await lint(content)
    const indentIssues = result.issues.filter((i: any) => i.ruleId === RULE)
    // Should not have issues for lines 4-5 (inside heredoc)
    for (const issue of indentIssues) {
      expect(issue.line).not.toBe(4)
      expect(issue.line).not.toBe(5)
    }
  })

  // ─── Fixer ────────────────────────────────────────────────────
  it('fixes 4-space indent to 2-space', async () => {
    const fixed = await lintFix('#!/bin/bash\nif true; then\n    echo "wrong"\nfi\n')
    expect(fixed).toContain('  echo "wrong"')
  })

  it('fixes zero-indent body to 2-space', async () => {
    const fixed = await lintFix('#!/bin/bash\nif true; then\necho "wrong"\nfi\n')
    expect(fixed).toContain('  echo "wrong"')
  })

  it('fixer is idempotent', async () => {
    const first = await lintFix('#!/bin/bash\nif true; then\n      echo "wrong"\nfi\n')
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

  // ─── Edge cases ───────────────────────────────────────────────
  it('handles empty file', async () => {
    const { code } = await lint('')
    expect(code).toBe(0)
  })

  it('handles file with only comments', async () => {
    const { code } = await lint('#!/bin/bash\n# just comments\n')
    expect(code).toBe(0)
  })

  it('skips shebang line for indentation check', async () => {
    const { code } = await lint('#!/bin/bash\necho "ok"\n')
    expect(code).toBe(0)
  })
})

// ─── Formatter integration ──────────────────────────────────────────

describe('shell formatter — exhaustive edge cases', () => {
  // ─── Basic indentation normalization ──────────────────────────
  it('normalizes if/then/fi', () => {
    const result = fmt('#!/bin/bash\nif true; then\necho "ok"\nfi\n')
    expect(result).toContain('  echo "ok"')
  })

  it('normalizes while/do/done', () => {
    const result = fmt('#!/bin/bash\nwhile true; do\necho "loop"\ndone\n')
    expect(result).toContain('  echo "loop"')
  })

  it('normalizes for/do/done', () => {
    const result = fmt('#!/bin/bash\nfor x in a b c; do\necho "$x"\ndone\n')
    expect(result).toContain('  echo "$x"')
  })

  it('normalizes until/do/done', () => {
    const result = fmt('#!/bin/bash\nuntil false; do\necho "loop"\ndone\n')
    expect(result).toContain('  echo "loop"')
  })

  it('normalizes function body', () => {
    const result = fmt('#!/bin/bash\nfoo() {\necho "bar"\n}\n')
    expect(result).toContain('  echo "bar"')
  })

  // ─── Deeply nested ────────────────────────────────────────────
  it('handles 4 levels of nesting', () => {
    const input = [
      '#!/bin/bash',
      'if true; then',
      'for i in 1 2; do',
      'while true; do',
      'if false; then',
      'echo "deep"',
      'fi',
      'break',
      'done',
      'done',
      'fi',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[5]).toBe('        echo "deep"') // 4 levels * 2 spaces = 8
    expect(lines[6]).toBe('      fi')              // 3 levels
    expect(lines[7]).toBe('      break')           // 3 levels
  })

  // ─── elif / else ──────────────────────────────────────────────
  it('elif and else at same level as if', () => {
    const input = [
      '#!/bin/bash',
      'if [[ "$x" == 1 ]]; then',
      'echo "1"',
      'elif [[ "$x" == 2 ]]; then',
      'echo "2"',
      'else',
      'echo "other"',
      'fi',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[1]).toBe('if [[ "$x" == 1 ]]; then')
    expect(lines[2]).toBe('  echo "1"')
    expect(lines[3]).toBe('elif [[ "$x" == 2 ]]; then')
    expect(lines[4]).toBe('  echo "2"')
    expect(lines[5]).toBe('else')
    expect(lines[6]).toBe('  echo "other"')
    expect(lines[7]).toBe('fi')
  })

  // ─── case/esac ────────────────────────────────────────────────
  it('formats case/esac with patterns and terminators', () => {
    const input = [
      '#!/bin/bash',
      'case "$1" in',
      'start)',
      'echo "go"',
      ';;',
      'stop)',
      'echo "halt"',
      ';;',
      'esac',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[1]).toBe('case "$1" in')
    expect(lines[2]).toBe('  start)')
    expect(lines[3]).toBe('    echo "go"')
    expect(lines[4]).toBe('  ;;')
    expect(lines[5]).toBe('  stop)')
    expect(lines[6]).toBe('    echo "halt"')
    expect(lines[7]).toBe('  ;;')
    expect(lines[8]).toBe('esac')
  })

  // ─── Command substitution NOT treated as case pattern ─────────
  it('does not indent after $(command) line', () => {
    const input = [
      '#!/bin/bash',
      'result=$(ls -la)',
      'echo "$result"',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[1]).toBe('result=$(ls -la)')
    expect(lines[2]).toBe('echo "$result"')  // should be at level 0
  })

  it('handles assignment with $() not causing indent increase', () => {
    const input = [
      '#!/bin/bash',
      'VAR1=$(cmd1)',
      'VAR2=$(cmd2)',
      'VAR3=$(cmd3)',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[1]).toBe('VAR1=$(cmd1)')
    expect(lines[2]).toBe('VAR2=$(cmd2)')
    expect(lines[3]).toBe('VAR3=$(cmd3)')
  })

  // ─── Heredoc preservation ─────────────────────────────────────
  it('preserves heredoc content verbatim', () => {
    const input = [
      '#!/bin/bash',
      'cat <<EOF',
      '  custom indent',
      'no indent',
      '      lots of indent',
      'EOF',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('  custom indent')
    expect(result).toContain('no indent')
    expect(result).toContain('      lots of indent')
  })

  it('preserves heredoc with dash (<<-)', () => {
    const input = '#!/bin/bash\ncat <<-EOF\n\tindented\nEOF\n'
    const result = fmt(input)
    expect(result).toContain('\tindented')
  })

  it('resumes indentation after heredoc', () => {
    const input = [
      '#!/bin/bash',
      'if true; then',
      'cat <<EOF',
      'heredoc content',
      'EOF',
      'echo "after"',
      'fi',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    // "after" should be indented inside the if block
    expect(lines[5]).toBe('  echo "after"')
    expect(lines[6]).toBe('fi')
  })

  // ─── Empty lines ──────────────────────────────────────────────
  it('blank lines inside blocks become empty', () => {
    const input = '#!/bin/bash\nif true; then\n\n  echo "ok"\nfi\n'
    const result = fmt(input)
    expect(result).toContain('\n\n')
  })

  // ─── Comments ─────────────────────────────────────────────────
  it('re-indents comments inside blocks', () => {
    const input = [
      '#!/bin/bash',
      'if true; then',
      '# this is a comment',
      'echo "ok"',
      'fi',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[2]).toBe('  # this is a comment')
    expect(lines[3]).toBe('  echo "ok"')
  })

  // ─── Idempotency ─────────────────────────────────────────────
  it('formatting is idempotent', () => {
    const input = [
      '#!/bin/bash',
      'if true; then',
      'for i in 1 2 3; do',
      'echo "$i"',
      'done',
      'fi',
      '',
    ].join('\n')
    const first = fmt(input)
    const second = fmt(first)
    expect(second).toBe(first)
  })

  it('already-formatted file is unchanged', () => {
    const input = [
      '#!/bin/bash',
      'if true; then',
      '  for i in 1 2 3; do',
      '    echo "$i"',
      '  done',
      'fi',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toBe(input)
  })

  // ─── Trailing whitespace ──────────────────────────────────────
  it('removes trailing whitespace', () => {
    const input = '#!/bin/bash\necho "ok"   \nls -la\t\t\n'
    const result = fmt(input)
    expect(result).not.toMatch(/[ \t]\n/)
  })

  // ─── Final newline ────────────────────────────────────────────
  it('ensures exactly one final newline', () => {
    const input = '#!/bin/bash\necho "ok"'
    const result = fmt(input)
    expect(result.endsWith('\n')).toBe(true)
    expect(result.endsWith('\n\n')).toBe(false)
  })

  // ─── Leading blank lines ─────────────────────────────────────
  it('removes leading blank lines', () => {
    const input = '\n\n#!/bin/bash\necho "ok"\n'
    const result = fmt(input)
    expect(result.startsWith('#!/bin/bash')).toBe(true)
  })

  // ─── Max consecutive blank lines ─────────────────────────────
  it('collapses multiple blank lines', () => {
    const input = '#!/bin/bash\n\n\n\n\necho "ok"\n'
    const result = fmt(input)
    expect(result).not.toContain('\n\n\n')
  })

  // ─── then/do on separate line ─────────────────────────────────
  it('handles then on separate line', () => {
    const input = '#!/bin/bash\nif true\nthen\necho "ok"\nfi\n'
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[2]).toBe('then')
    expect(lines[3]).toBe('  echo "ok"')
  })

  it('handles do on separate line', () => {
    const input = '#!/bin/bash\nwhile true\ndo\necho "loop"\ndone\n'
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[2]).toBe('do')
    expect(lines[3]).toBe('  echo "loop"')
  })
})
