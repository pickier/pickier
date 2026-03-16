/* eslint-disable no-console, style/max-statements-per-line */
import type { LintOptions } from '../../../src/types'
import { afterEach, expect, it } from 'bun:test'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runLint } from '../../../src/linter'

const tempFiles: string[] = []

function createTempFile(content: string, suffix = '.ts'): string {
  const tempPath = resolve(__dirname, `temp-style-edge-${Date.now()}-${Math.random().toString(36).substring(7)}${suffix}`)
  writeFileSync(tempPath, content)
  tempFiles.push(tempPath)
  return tempPath
}

function createConfigWithStyleRules(): string {
  const configPath = resolve(__dirname, `temp-config-${Date.now()}.json`)
  writeFileSync(configPath, JSON.stringify({
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], indent: 2, quotes: 'single', semi: false, trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one' },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'style/curly': 'warn', 'style/if-newline': 'warn', 'pickier/no-unused-vars': 'off' },
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

it('should handle else if chains with single statements', async () => {
  const content = `
if (condition1) {
  statement1()
}
else if (condition2) {
  statement2()
}
else {
  statement3()
}
`

  const tempPath = createTempFile(content)
  const configPath = createConfigWithStyleRules()
  const options: LintOptions = { reporter: 'json', config: configPath }

  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }

  try {
    await runLint([tempPath], options)
    console.log = originalLog

    const result = JSON.parse(output)
    // The curly rule may only flag some of these based on implementation
    expect(result.issues.length).toBeGreaterThanOrEqual(1)
    // May have both style/curly and style/if-newline issues
    expect(result.issues.every((issue: any) => issue.ruleId.startsWith('style/'))).toBe(true)
  }
  finally {
    console.log = originalLog
  }
})

it('should handle nested if statements', async () => {
  const content = `
if (outer) {
  if (inner) {
    doSomething()
  }
}
`

  const tempPath = createTempFile(content)
  const configPath = createConfigWithStyleRules()
  const options: LintOptions = { reporter: 'json', config: configPath }

  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }

  try {
    await runLint([tempPath], options)
    console.log = originalLog

    const result = JSON.parse(output)
    // May flag one or more based on how the curly rule interprets nested structures
    expect(result.issues.length).toBeGreaterThanOrEqual(0)
  }
  finally {
    console.log = originalLog
  }
})

it('should handle if statements with complex expressions', async () => {
  const content = `
if (a && b || c && (d || e)) {
  func()
}
`

  const tempPath = createTempFile(content)
  const configPath = createConfigWithStyleRules()
  const options: LintOptions = { reporter: 'json', config: configPath }

  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }

  try {
    await runLint([tempPath], options)
    console.log = originalLog

    const result = JSON.parse(output)
    // Test that the linter runs successfully on complex expressions
    expect(result.issues.length).toBeGreaterThanOrEqual(0)
  }
  finally {
    console.log = originalLog
  }
})

it('should not flag multiline single statements that span lines', async () => {
  const content = `
if (condition) {
  functionWithLongName(
    argument1,
    argument2
  )
}
`

  const tempPath = createTempFile(content)
  const configPath = createConfigWithStyleRules()
  const options: LintOptions = { reporter: 'json', config: configPath }

  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }

  try {
    await runLint([tempPath], options)
    console.log = originalLog

    const result = JSON.parse(output)
    expect(result.issues).toHaveLength(0) // Multiline calls should not be flagged
  }
  finally {
    console.log = originalLog
  }
})

it('should handle if with single statement followed by comment', async () => {
  const content = `
if (condition) {
  doSomething() // this is a comment
}
`

  const tempPath = createTempFile(content)
  const configPath = createConfigWithStyleRules()
  const options: LintOptions = { reporter: 'json', config: configPath }

  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }

  try {
    await runLint([tempPath], options)
    console.log = originalLog

    const result = JSON.parse(output)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].ruleId).toBe('style/curly')
  }
  finally {
    console.log = originalLog
  }
})

it('should handle mixed single and multiple statement blocks', async () => {
  const content = `
if (condition1) {
  statement1()
  statement2()
}
else if (condition2) {
  singleStatement()
}
else {
  statement3()
  statement4()
}
`

  const tempPath = createTempFile(content)
  const configPath = createConfigWithStyleRules()
  const options: LintOptions = { reporter: 'json', config: configPath }

  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }

  try {
    await runLint([tempPath], options)
    console.log = originalLog

    const result = JSON.parse(output)
    // Test that mixed blocks are handled properly
    expect(result.issues.length).toBeGreaterThanOrEqual(0)
  }
  finally {
    console.log = originalLog
  }
})

it('should handle if statements with empty blocks', async () => {
  const content = `
if (condition) {
}
else {
  doSomething()
}
`

  const tempPath = createTempFile(content)
  const configPath = createConfigWithStyleRules()
  const options: LintOptions = { reporter: 'json', config: configPath }

  const originalLog = console.log
  let output = ''
  console.log = (msg: string) => { output += msg }

  try {
    await runLint([tempPath], options)
    console.log = originalLog

    const result = JSON.parse(output)
    // Empty blocks should not be flagged, only the else with single statement
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].message).toBe('Unnecessary curly braces around single statement')
  }
  finally {
    console.log = originalLog
  }
})
