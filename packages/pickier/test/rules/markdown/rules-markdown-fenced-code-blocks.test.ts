/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

describe('MD022 blanks-around-headings - fenced code block handling', () => {
  it('should not flag hash comments inside fenced code blocks', async () => {
    const content = `# Title

\`\`\`bash
# This is a bash comment, not a heading
npm install ts-punycode

# Another bash comment
yarn add ts-punycode
\`\`\`
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-headings': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('should still flag headings outside fenced code blocks', async () => {
    const content = `# Title
Some text without blank line before heading.
## Heading 2
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-headings': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/blanks-around-headings')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should handle multiple fenced code blocks with hash comments', async () => {
    const content = `# Title

\`\`\`bash
# Using npm
npm install my-package
\`\`\`

\`\`\`bash
# Using yarn
yarn add my-package

# Using pnpm
pnpm add my-package
\`\`\`
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-headings': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('should handle tilde fenced code blocks', async () => {
    const content = `# Title

~~~bash
# Comment inside tilde fence
echo "hello"
~~~
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-headings': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD025 single-title - fenced code block handling', () => {
  it('should not flag hash comments in fenced code blocks as h1', async () => {
    const content = `# Title

\`\`\`bash
# This is a bash comment, not an h1
echo "hello"

# Another bash comment
echo "world"
\`\`\`
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/single-title': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('should still flag multiple real h1 headings', async () => {
    const content = `# First Title

# Second Title
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/single-title': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/single-title')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should handle h1 before code block and comments inside', async () => {
    const content = `# Real Title

Some content.

\`\`\`python
# Python comment that looks like h1
print("hello")
\`\`\`

## Section 2

\`\`\`ruby
# Ruby comment that looks like h1
puts "hello"
\`\`\`
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/single-title': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })

  it('should handle tilde fenced code blocks for single-title', async () => {
    const content = `# Real Title

~~~bash
# Not an h1
echo "test"
~~~
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/single-title': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues).toHaveLength(0)
    }
    finally {
      console.log = originalLog
    }
  })
})
