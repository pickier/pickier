/* eslint-disable no-console, style/max-statements-per-line */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runLint } from '../../../src/linter'

const tempFiles: string[] = []

function createTempFile(content: string, suffix = '.ts'): string {
  const tempPath = resolve(__dirname, `temp-brace-style-${Date.now()}-${Math.random().toString(36).substring(7)}${suffix}`)
  writeFileSync(tempPath, content)
  tempFiles.push(tempPath)
  return tempPath
}

function createConfigWithBraceStyle(): string {
  const configPath = resolve(__dirname, `temp-config-${Date.now()}.json`)
  writeFileSync(configPath, JSON.stringify({
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], indent: 2, quotes: 'single', semi: false, trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one' },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'style/brace-style': 'error' },
  }))
  tempFiles.push(configPath)
  return configPath
}

function cleanupTempFiles(): void {
  for (const file of tempFiles) {
    if (existsSync(file)) {
      unlinkSync(file)
    }
  }
  tempFiles.length = 0
}

// Cleanup after each test
afterEach(() => {
  cleanupTempFiles()
})

describe('style/brace-style', () => {
  it('should flag closing brace on same line as else', async () => {
    const content = `
if (condition) {
  doSomething()
} else {
  doSomethingElse()
}
`

    const tempPath = createTempFile(content)
    const configPath = createConfigWithBraceStyle()
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      const braceStyleIssues = result.issues.filter((i: any) => i.ruleId === 'style/brace-style')
      expect(braceStyleIssues.length).toBeGreaterThan(0)
      expect(braceStyleIssues[0].message).toBe('Closing curly brace appears on the same line as the subsequent block')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should flag closing brace on same line as catch', async () => {
    const content = `
try {
  doSomething()
} catch (error) {
  handleError(error)
}
`

    const tempPath = createTempFile(content)
    const configPath = createConfigWithBraceStyle()
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      const braceStyleIssues = result.issues.filter((i: any) => i.ruleId === 'style/brace-style')
      expect(braceStyleIssues.length).toBeGreaterThan(0)
      expect(braceStyleIssues[0].message).toBe('Closing curly brace appears on the same line as the subsequent block')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should flag closing brace on same line as finally', async () => {
    const content = `
try {
  doSomething()
} catch (error) {
  handleError(error)
} finally {
  cleanup()
}
`

    const tempPath = createTempFile(content)
    const configPath = createConfigWithBraceStyle()
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      const braceStyleIssues = result.issues.filter((i: any) => i.ruleId === 'style/brace-style')
      expect(braceStyleIssues.length).toBeGreaterThan(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('should accept correct brace style with else on new line', async () => {
    const content = `
if (condition) {
  doSomething()
}
else {
  doSomethingElse()
}
`

    const tempPath = createTempFile(content)
    const configPath = createConfigWithBraceStyle()
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      const braceStyleIssues = result.issues.filter((i: any) => i.ruleId === 'style/brace-style')
      expect(braceStyleIssues.length).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('should accept if-else without braces', async () => {
    const content = `
if (condition)
  doSomething()
else
  doSomethingElse()
`

    const tempPath = createTempFile(content)
    const configPath = createConfigWithBraceStyle()
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      const braceStyleIssues = result.issues.filter((i: any) => i.ruleId === 'style/brace-style')
      expect(braceStyleIssues.length).toBe(0)
    }
    finally {
      console.log = originalLog
    }
  })
})
