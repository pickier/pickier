import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { formatCode } from '../../../src/format'
import { config as defaultConfig } from '../../../src/config'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── Complex real-world script scenarios ────────────────────────────

describe('shell integration — real-world scripts', () => {
  it('correctly lints a well-formed deployment script', async () => {
    const content = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      'DEPLOY_DIR="/opt/app"',
      'LOG_FILE="/var/log/deploy.log"',
      '',
      'deploy() {',
      '  echo "Deploying..."',
      '  cd "$DEPLOY_DIR" || exit 1',
      '  git pull origin main',
      '  npm install --production',
      '  npm run build',
      '  systemctl restart myapp',
      '}',
      '',
      'main() {',
      '  if [[ $# -lt 1 ]]; then',
      '    echo "Usage: $0 <environment>"',
      '    exit 1',
      '  fi',
      '',
      '  local env="$1"',
      '',
      '  case "$env" in',
      '    prod)',
      '      deploy',
      '    ;;',
      '    staging)',
      '      echo "Deploying to staging"',
      '      deploy',
      '    ;;',
      '    *)',
      '      echo "Unknown environment: $env"',
      '      exit 1',
      '    ;;',
      '  esac',
      '}',
      '',
      'main "$@"',
      '',
    ].join('\n')

    const tempPath = createTempFile(content)
    // Enable all rules
    const configPath = createConfigWithShellRules({
      'shell/command-substitution': 'error',
      'shell/quote-variables': 'warn',
      'shell/no-cd-without-check': 'warn',
      'shell/no-eval': 'error',
      'shell/shebang': 'error',
      'shell/indent': 'warn',
      'shell/function-style': 'warn',
      'shell/operator-spacing': 'warn',
      'shell/no-trailing-semicolons': 'warn',
      'shell/no-trailing-whitespace': 'error',
      'shell/prefer-double-brackets': 'warn',
      'shell/set-options': 'error',
      'shell/prefer-printf': 'warn',
      'shell/no-broken-redirect': 'error',
      'shell/no-ls-parsing': 'warn',
      'shell/no-variable-in-single-quotes': 'warn',
      'shell/no-exit-in-subshell': 'warn',
    })
    const options: LintOptions = { reporter: 'json', config: configPath }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      // This well-formed script should pass (or only have minor warnings)
      expect(code).toBe(0) // no errors
    }
    finally { console.log = originalLog }
  })

  it('correctly identifies multiple issues in a bad script', async () => {
    const content = [
      'echo "no shebang"',        // missing shebang
      'result=`date`',              // backtick
      'cd /tmp',                    // no error handling
      'eval "echo $result"',        // eval + unquoted var
      'cat file.txt | grep "x"',   // UUOC
      'echo -e "hello\\n"',         // echo -e
      'cmd 2>&1 > output.log',      // broken redirect
      '',
    ].join('\n')

    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({
      'shell/shebang': 'error',
      'shell/command-substitution': 'error',
      'shell/no-cd-without-check': 'error',
      'shell/no-eval': 'error',
      'shell/no-useless-cat': 'error',
      'shell/prefer-printf': 'error',
      'shell/no-broken-redirect': 'error',
    })
    const options: LintOptions = { reporter: 'json', config: configPath }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1) // errors found
      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThanOrEqual(5)

      const ruleIds = result.issues.map((i: any) => i.ruleId)
      expect(ruleIds).toContain('shell/command-substitution')
      expect(ruleIds).toContain('shell/no-cd-without-check')
      expect(ruleIds).toContain('shell/no-eval')
      expect(ruleIds).toContain('shell/no-useless-cat')
      expect(ruleIds).toContain('shell/no-broken-redirect')
    }
    finally { console.log = originalLog }
  })

  it('--fix corrects fixable issues without breaking non-fixable ones', async () => {
    const content = [
      '#!/bin/bash',
      'function bad_func {',      // function-style (fixable)
      '  result=`date`',          // command-substitution (fixable)
      '  echo "hello";',          // trailing-semicolons (fixable)
      '  echo "ok"   ',           // trailing-whitespace (fixable)
      '  cd /tmp',                // no-cd-without-check (NOT fixable)
      '}',
      '',
    ].join('\n')

    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({
      'shell/function-style': 'error',
      'shell/command-substitution': 'error',
      'shell/no-trailing-semicolons': 'error',
      'shell/no-trailing-whitespace': 'error',
      'shell/no-cd-without-check': 'warn',
    })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      await runLint([tempPath], options)
      const fixed = readFileSync(tempPath, 'utf8')

      // Fixable issues should be fixed
      expect(fixed).toContain('bad_func() {')      // function-style fixed
      expect(fixed).toContain('$(date)')            // command-substitution fixed
      expect(fixed).not.toMatch(/echo "hello";/)    // trailing semicolons fixed
      expect(fixed).not.toMatch(/ok"   /)           // trailing whitespace fixed

      // Non-fixable should remain
      expect(fixed).toContain('cd /tmp')  // cd without check still present
    }
    finally { console.log = originalLog }
  })
})

// ─── shellOnly wrapper edge cases ───────────────────────────────────

describe('shellOnly wrapper — file detection', () => {
  it('runs rules on .sh files', async () => {
    const tempPath = createTempFile('#!/bin/bash\nresult=`ls`\n', '.sh')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ 'shell/command-substitution': 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
    }
    finally { console.log = originalLog }
  })

  it('runs rules on .bash files', async () => {
    const tempPath = createTempFile('#!/bin/bash\nresult=`ls`\n', '.bash')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ 'shell/command-substitution': 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
    }
    finally { console.log = originalLog }
  })

  it('runs rules on .zsh files', async () => {
    const tempPath = createTempFile('#!/bin/zsh\nresult=`ls`\n', '.zsh')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ 'shell/command-substitution': 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
    }
    finally { console.log = originalLog }
  })

  it('does NOT run shell rules on .ts files', async () => {
    const tempPath = createTempFile('const x = `template`\n', '.ts')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ 'shell/command-substitution': 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      const result = JSON.parse(output)
      const shellIssues = result.issues.filter((i: any) => i.ruleId.startsWith('shell/'))
      expect(shellIssues.length).toBe(0)
    }
    finally { console.log = originalLog }
  })

  it('does NOT run shell rules on .md files', async () => {
    const tempPath = createTempFile('# Shell example\n```bash\nresult=`ls`\n```\n', '.md')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ 'shell/command-substitution': 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      const result = JSON.parse(output)
      const shellIssues = result.issues.filter((i: any) => i.ruleId.startsWith('shell/'))
      expect(shellIssues.length).toBe(0)
    }
    finally { console.log = originalLog }
  })
})

// ─── Formatter edge cases ───────────────────────────────────────────

describe('shell formatter — advanced edge cases', () => {
  function fmt(content: string, filePath = 'test.sh'): string {
    return formatCode(content, defaultConfig, filePath)
  }

  it('does not apply shell formatting to .ts files', () => {
    const input = 'const x = 1\nif (true) {\n  console.log(x)\n}\n'
    const result = formatCode(input, defaultConfig, 'test.ts')
    // Should NOT have shell indentation logic applied
    expect(result).toContain('if (true) {')
  })

  it('handles script with only shebang', () => {
    const result = fmt('#!/bin/bash\n')
    expect(result).toBe('#!/bin/bash\n')
  })

  it('handles empty input', () => {
    const result = fmt('')
    expect(result).toBe('')
  })

  it('handles script with mixed control structures', () => {
    const input = [
      '#!/bin/bash',
      'main() {',
      'if [[ -f config ]]; then',
      'while read -r line; do',
      'case "$line" in',
      '#*)',
      ';;',
      '*)',
      'echo "$line"',
      ';;',
      'esac',
      'done < config',
      'else',
      'echo "no config"',
      'fi',
      '}',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')

    expect(lines[0]).toBe('#!/bin/bash')
    expect(lines[1]).toBe('main() {')
    expect(lines[2]).toBe('  if [[ -f config ]]; then')
    expect(lines[3]).toBe('    while read -r line; do')
    expect(lines[4]).toBe('      case "$line" in')
  })

  it('handles consecutive heredocs', () => {
    const input = [
      '#!/bin/bash',
      'cat <<EOF1',
      'first doc',
      'EOF1',
      'cat <<EOF2',
      'second doc',
      'EOF2',
      'echo "after"',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('first doc')
    expect(result).toContain('second doc')
    expect(result).toContain('echo "after"')
  })

  it('handles heredoc with similar delimiter names', () => {
    const input = [
      '#!/bin/bash',
      'cat <<EOF',
      'content with EOFX inside',
      'EOF',
      'echo "after"',
      '',
    ].join('\n')
    const result = fmt(input)
    expect(result).toContain('content with EOFX inside')
  })

  it('correctly handles else on its own line', () => {
    const input = [
      '#!/bin/bash',
      'if true; then',
      'echo "yes"',
      'else',
      'echo "no"',
      'fi',
      '',
    ].join('\n')
    const result = fmt(input)
    const lines = result.split('\n')
    expect(lines[1]).toBe('if true; then')
    expect(lines[2]).toBe('  echo "yes"')
    expect(lines[3]).toBe('else')
    expect(lines[4]).toBe('  echo "no"')
    expect(lines[5]).toBe('fi')
  })

  it('handles closing brace on same line as content', () => {
    const input = '#!/bin/bash\nfoo() { echo "inline"; }\n'
    const result = fmt(input)
    // Single-line function body — brace open and close on same line
    // The formatter should handle this gracefully
    expect(result).toContain('foo()')
  })

  it('preserves shebang flags', () => {
    const input = '#!/bin/bash -e\necho "ok"\n'
    const result = fmt(input)
    expect(result).toContain('#!/bin/bash -e')
  })

  it('handles multiple blank lines between functions', () => {
    const input = [
      '#!/bin/bash',
      'foo() {',
      '  echo "foo"',
      '}',
      '',
      '',
      '',
      '',
      'bar() {',
      '  echo "bar"',
      '}',
      '',
    ].join('\n')
    const result = fmt(input)
    // maxConsecutiveBlankLines is 1 by default
    expect(result).not.toContain('\n\n\n')
  })
})

// ─── Disable directive compatibility ────────────────────────────────
// Note: The linter's disable directive parser recognizes // and /* comments (JS/TS style).
// Shell scripts use # for comments. Disable directives in shell scripts must currently
// be written as: # eslint-disable-next-line (the parser sees the text regardless of comment style).
// However, since shell rules skip lines starting with #, the directive line won't be processed
// by individual rules, but the linter's central parser may or may not recognize # comments.

describe('shell rules — disable directives', () => {
  it('rules skip comment lines (# comments ignored by shell rules)', async () => {
    // Verify that shell rules properly skip # comment lines
    const content = [
      '#!/bin/bash',
      '# eval "this is a comment"',
      'echo "safe"',
      '',
    ].join('\n')
    const tempPath = createTempFile(content)
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ 'shell/no-eval': 'error' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      const result = JSON.parse(output)
      const evalIssues = result.issues.filter((i: any) => i.ruleId === 'shell/no-eval')
      expect(evalIssues.length).toBe(0) // eval in comment not flagged
    }
    finally { console.log = originalLog }
  })

  it('can disable rules via config (setting rule to off)', async () => {
    const content = '#!/bin/bash\nresult=`date`\n'
    const tempPath = createTempFile(content)
    // Rule is set to off — should not be flagged
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({ 'shell/command-substitution': 'off' }) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      const result = JSON.parse(output)
      const cmdIssues = result.issues.filter((i: any) => i.ruleId === 'shell/command-substitution')
      expect(cmdIssues.length).toBe(0)
    }
    finally { console.log = originalLog }
  })
})
