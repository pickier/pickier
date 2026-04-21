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

// Regression tests for https://github.com/pickier/pickier/issues/1351 —
// shell linter auto-fix corrupts valid bash syntax and reports false positives.

describe('issue #1351 — shell/operator-spacing does not corrupt ANSI and array expansions', () => {
  const RULE = 'shell/operator-spacing'

  it('does not flag [ inside $\'...\' ANSI-C quoted strings', async () => {
    const { code } = await lintRule('#!/bin/bash\nRED=$\'\\033[0;31m\'\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag [ inside ${arr[@]} array expansion', async () => {
    const { code } = await lintRule('#!/bin/bash\nCERTS=("a" "b")\nfor c in "${CERTS[@]}"; do :; done\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag [ inside ${#arr[@]} length expansion', async () => {
    const { code } = await lintRule('#!/bin/bash\nCERTS=()\nif [[ ${#CERTS[@]} -eq 0 ]]; then :; fi\n', RULE)
    expect(code).toBe(0)
  })

  it('does not corrupt ANSI escapes when fixing', async () => {
    const input = '#!/bin/bash\nRED=$\'\\033[0;31m\'\nNC=$\'\\033[0m\'\n'
    const fixed = await lintFixRule(input, RULE)
    expect(fixed).toBe(input)
  })

  it('does not corrupt ${arr[@]} when fixing', async () => {
    const input = '#!/bin/bash\nCERTS=("a" "b")\nfor c in "${CERTS[@]}"; do :; done\n'
    const fixed = await lintFixRule(input, RULE)
    expect(fixed).toBe(input)
  })

  it('does not corrupt [[ ${#arr[@]} -eq 0 ]] when fixing', async () => {
    const input = '#!/bin/bash\nCERTS=()\nif [[ ${#CERTS[@]} -eq 0 ]]; then :; fi\n'
    const fixed = await lintFixRule(input, RULE)
    expect(fixed).toBe(input)
  })

  it('still flags a real bad [[ test expression', async () => {
    const { code } = await lintRule('#!/bin/bash\nif [[-z "$var" ]]; then :; fi\n', RULE)
    expect(code).toBe(1)
  })

  it('still fixes a real bad [[ ]] test expression', async () => {
    const fixed = await lintFixRule('#!/bin/bash\nif [[-z "$var" ]]; then :; fi\n', RULE)
    expect(fixed).toContain('[[ -z')
  })

  it('does not flag single [ inside parameter expansion', async () => {
    const { code } = await lintRule('#!/bin/bash\narr=(a b c)\necho "${arr[0]}"\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag brackets inside single-quoted string', async () => {
    const { code } = await lintRule('#!/bin/bash\necho \'[ a b ]\'\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag brackets inside double-quoted string', async () => {
    const { code } = await lintRule('#!/bin/bash\necho "[foo]"\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag bracket regex character class in [[ =~ ]]', async () => {
    const { code } = await lintRule('#!/bin/bash\n[[ "$s" =~ ^[0-9]+$ ]] && echo num\n', RULE)
    expect(code).toBe(0)
  })
})

describe('issue #1351 — shell/keyword-spacing ignores semicolons inside strings', () => {
  const RULE = 'shell/keyword-spacing'

  it('does not flag ; inside $\'\\033[0;31m\' ANSI code', async () => {
    const { code } = await lintRule('#!/bin/bash\nRED=$\'\\033[0;31m\'\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag ; inside double-quoted string', async () => {
    const { code } = await lintRule('#!/bin/bash\nmsg="a;b"\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag ; inside single-quoted string', async () => {
    const { code } = await lintRule('#!/bin/bash\nmsg=\'a;b\'\n', RULE)
    expect(code).toBe(0)
  })

  it('still flags ;then (no space after ;)', async () => {
    const { code } = await lintRule('#!/bin/bash\nif true;then echo ok; fi\n', RULE)
    expect(code).toBe(1)
  })
})

describe('issue #1351 — shell/quote-variables understands nested command substitution', () => {
  const RULE = 'shell/quote-variables'

  it('does not flag "$var" inside "$(cmd "$var")"', async () => {
    const { code } = await lintRule('#!/bin/bash\nfor cert in a b; do printf "%s" "$(basename "$cert")"; done\n', RULE)
    expect(code).toBe(0)
  })

  it('does not flag "$var" inside "$(cmd1 | cmd2 "$var")"', async () => {
    const { code } = await lintRule('#!/bin/bash\nf=x\nresult="$(echo "$f" | tr a b)"\necho "$result"\n', RULE)
    expect(code).toBe(0)
  })

  it('still flags unquoted $var in basic line', async () => {
    const { code } = await lintRule('#!/bin/bash\nf=x\ncat $f\n', RULE)
    expect(code).toBe(1)
  })

  it('still flags unquoted $var inside $(cmd $var) — unquoted subshell arg', async () => {
    const { code } = await lintRule('#!/bin/bash\nf=x\nresult=$(echo $f)\n', RULE)
    expect(code).toBe(1)
  })
})

describe('issue #1351 — shell/consistent-case-terminators handles loops inside case branches', () => {
  const RULE = 'shell/consistent-case-terminators'

  it('does not flag case branch with for loop whose body contains $()', async () => {
    const input = `#!/bin/bash
UNAME=x
case "$UNAME" in
  Linux*)
    echo linux
    ;;
  Win*)
    for cert in a b; do
      winpath=$(printf '%s' "$cert" | sed 's/\\//\\\\/g')
      printf '%s\\n' "$winpath"
    done
    ;;
esac
`
    const { code } = await lintRule(input, RULE)
    expect(code).toBe(0)
  })

  it('does not flag case branch with while loop and nested if', async () => {
    const input = `#!/bin/bash
case "$1" in
  a)
    while read -r line; do
      if [[ -n "$line" ]]; then
        echo "$line"
      fi
    done
    ;;
  b)
    echo b
    ;;
esac
`
    const { code } = await lintRule(input, RULE)
    expect(code).toBe(0)
  })

  it('still flags genuinely missing ;; terminator', async () => {
    const input = `#!/bin/bash
case "$1" in
  a)
    echo a
  b)
    echo b
    ;;
esac
`
    const { code } = await lintRule(input, RULE)
    expect(code).toBe(1)
  })

  it('handles patterns with | alternation correctly (no false positive)', async () => {
    const input = `#!/bin/bash
case "$1" in
  a|b|c)
    echo alpha
    ;;
  d|e)
    echo delta
    ;;
esac
`
    const { code } = await lintRule(input, RULE)
    expect(code).toBe(0)
  })

  it('still flags missing ;; between | alternation patterns', async () => {
    const input = `#!/bin/bash
case "$1" in
  a|b|c)
    echo alpha
  d|e)
    echo delta
    ;;
esac
`
    const { code } = await lintRule(input, RULE)
    expect(code).toBe(1)
  })

  it('handles (pattern) leading paren form', async () => {
    const input = `#!/bin/bash
case "$1" in
  (a)
    echo a
    ;;
  (b)
    echo b
    ;;
esac
`
    const { code } = await lintRule(input, RULE)
    expect(code).toBe(0)
  })
})

describe('issue #1351 — built-in quotes rule is skipped for shell files', () => {
  it('does not flag mixed single/double quotes in .sh', async () => {
    const tempPath = createTempFile('#!/bin/bash\nprintf \'hello %s\\n\' "$USER"\n')
    const options: LintOptions = { reporter: 'json', config: createConfigWithShellRules({}) }
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      const code = await runLint([tempPath], options)
      const result = JSON.parse(output)
      expect(code).toBe(0)
      expect(result.issues?.some((i: { ruleId: string }) => i.ruleId === 'quotes')).toBeFalsy()
    }
    finally { console.log = originalLog }
  })
})

describe('issue #1351 — full reproducer runs clean end-to-end', () => {
  it('the exact reproducer from the issue: lint returns 0 and --fix is a no-op', async () => {
    const input = `#!/bin/bash
RED=$'\\033[0;31m'
NC=$'\\033[0m'
items=("a" "b" "c")
for item in "\${items[@]}"; do
  printf '%b%s%b\\n' "$RED" "$item" "$NC"
done
`
    const tempPath = createTempFile(input)
    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }
    try {
      // Enable every rule that the issue accused of corrupting or
      // reporting false positives. Rules unrelated to the reported bugs
      // (set-options, shebang, etc.) stay off so the test targets the
      // reported regressions.
      const code = await runLint([tempPath], {
        reporter: 'json',
        config: createConfigWithShellRules({
          'shell/quote-variables': 'error',
          'shell/operator-spacing': 'error',
          'shell/keyword-spacing': 'error',
          'shell/consistent-case-terminators': 'error',
          'shell/no-trailing-whitespace': 'error',
        }),
        fix: true,
      })
      expect(code).toBe(0)
      const after = readFileSync(tempPath, 'utf8')
      expect(after).toBe(input)
    }
    finally { console.log = originalLog }
  })
})
