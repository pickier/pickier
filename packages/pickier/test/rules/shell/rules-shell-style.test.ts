import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { LintOptions } from '../../../src/types'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithShellRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// ─── shell/shebang ────────────────────────────────────────────────────

describe('shell/shebang', () => {
  it('flags missing shebang', async () => {
    const content = 'echo "hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/shebang': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/shebang')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('accepts #!/usr/bin/env bash', async () => {
    const content = '#!/usr/bin/env bash\necho "hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/shebang': 'error' })
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

  it('accepts #!/bin/sh', async () => {
    const content = '#!/bin/sh\necho "hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/shebang': 'error' })
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

  it('flags invalid shebang', async () => {
    const content = '#!/usr/bin/python3\necho "hello"\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/shebang': 'error' })
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
})

// ─── shell/function-style ─────────────────────────────────────────────

describe('shell/function-style', () => {
  it('flags function keyword style', async () => {
    const content = '#!/bin/bash\nfunction my_func {\n  echo "hello"\n}\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/function-style': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/function-style')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows POSIX function style', async () => {
    const content = '#!/bin/bash\nmy_func() {\n  echo "hello"\n}\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/function-style': 'error' })
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

  it('fixes function keyword to POSIX style', async () => {
    const content = '#!/bin/bash\nfunction my_func {\n  echo "hello"\n}\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/function-style': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      const fixed = readFileSync(tempPath, 'utf8')
      expect(fixed).toContain('my_func() {')
      expect(fixed).not.toContain('function my_func')
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/operator-spacing ───────────────────────────────────────────

describe('shell/operator-spacing', () => {
  it('flags missing space after [[', async () => {
    const content = '#!/bin/bash\nif [[-z "$var" ]]; then echo ok; fi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/operator-spacing': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/operator-spacing')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows proper [[ ]] spacing', async () => {
    const content = '#!/bin/bash\nif [[ -z "$var" ]]; then echo ok; fi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/operator-spacing': 'error' })
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

  it('fixes operator spacing', async () => {
    const content = '#!/bin/bash\nif [[-z "$var"]]; then echo ok; fi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/operator-spacing': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      const fixed = readFileSync(tempPath, 'utf8')
      expect(fixed).toContain('[[ -z')
      expect(fixed).toContain(' ]]')
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/no-trailing-semicolons ─────────────────────────────────────

describe('shell/no-trailing-semicolons', () => {
  it('flags unnecessary trailing semicolons', async () => {
    const content = '#!/bin/bash\necho "hello";\nls -la;\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-trailing-semicolons': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/no-trailing-semicolons')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows ;; in case statements', async () => {
    const content = '#!/bin/bash\ncase "$1" in\n  start)\n    echo "starting";;\n  stop)\n    echo "stopping";;\nesac\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-trailing-semicolons': 'error' })
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

  it('allows ; then and ; do patterns', async () => {
    const content = '#!/bin/bash\nif [[ -f file ]]; then\n  echo ok\nfi\nfor i in 1 2 3; do\n  echo $i\ndone\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-trailing-semicolons': 'error' })
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

  it('fixes trailing semicolons', async () => {
    const content = '#!/bin/bash\necho "hello";\nls -la;\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-trailing-semicolons': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      const fixed = readFileSync(tempPath, 'utf8')
      expect(fixed).not.toContain('hello";')
      expect(fixed).not.toContain('la";')
    }
    finally {
      console.log = originalLog
    }
  })
})

// ─── shell/no-trailing-whitespace ─────────────────────────────────────

describe('shell/no-trailing-whitespace', () => {
  it('flags trailing whitespace', async () => {
    const content = '#!/bin/bash\necho "hello"   \nls -la\t\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-trailing-whitespace': 'error' })
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

  it('allows clean lines', async () => {
    const content = '#!/bin/bash\necho "hello"\nls -la\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/no-trailing-whitespace': 'error' })
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

// ─── shell/keyword-spacing ────────────────────────────────────────────

describe('shell/keyword-spacing', () => {
  it('flags missing space after semicolon', async () => {
    const content = '#!/bin/bash\nif [[ true ]];then echo ok; fi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/keyword-spacing': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      const code = await runLint([tempPath], options)
      expect(code).toBe(1)
      const result = JSON.parse(output)
      expect(result.issues.some((i: any) => i.ruleId === 'shell/keyword-spacing')).toBe(true)
    }
    finally {
      console.log = originalLog
    }
  })

  it('allows proper keyword spacing', async () => {
    const content = '#!/bin/bash\nif [[ true ]]; then echo ok; fi\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithShellRules({ 'shell/keyword-spacing': 'error' })
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
