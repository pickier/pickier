/* eslint-disable no-console */
import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

describe('MD001 - heading-increment', () => {
  it('should flag skipped heading levels', async () => {
    const content = `# Heading 1

### Heading 3 (skipped level 2)
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/heading-increment': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/heading-increment')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag proper heading increment', async () => {
    const content = `# Heading 1

## Heading 2

### Heading 3
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/heading-increment': 'error' })
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

  describe('fix: clamp skipped heading levels (logsmith CHANGELOG pattern)', () => {
    async function runFix(src: string): Promise<string> {
      const tempPath = createTempFile(src)
      const configPath = createConfigWithMarkdownRules({ 'markdown/heading-increment': 'error' })
      await runLint([tempPath], { reporter: 'json', config: configPath, fix: true })
      const { readFileSync } = await import('node:fs')
      return readFileSync(tempPath, 'utf8')
    }

    it('demotes h3 after h1 to h2', async () => {
      const src = '# Title\n\n### Section\n\nBody.\n'
      expect(await runFix(src)).toBe('# Title\n\n## Section\n\nBody.\n')
    })

    it('demotes a chain (logsmith changelog pattern)', async () => {
      // Logsmith emits: # Changelog → ### v1.0.0 → #### Features
      const src = '# Changelog\n\n### v1.0.0\n\n#### Features\n\n- thing\n'
      expect(await runFix(src)).toBe('# Changelog\n\n## v1.0.0\n\n### Features\n\n- thing\n')
    })

    it('preserves going BACK up the tree (h3 → h2 is fine)', async () => {
      const src = '# H1\n\n## H2\n\n### H3\n\n## Back to H2\n'
      expect(await runFix(src)).toBe(src)
    })

    it('does not touch headings inside code blocks', async () => {
      const src = '# Title\n\n```markdown\n# h1\n### h3 (in code)\n```\n\n## Section\n'
      expect(await runFix(src)).toBe(src)
    })

    it('handles multiple consecutive jumps independently', async () => {
      const src = '# H1\n\n#### H4\n'
      // first jump h1→h4 clamps to h2; no further jumps to fix
      expect(await runFix(src)).toBe('# H1\n\n## H4\n')
    })
  })
})

describe('MD003 - heading-style', () => {
  it('should flag mixed heading styles', async () => {
    const content = `# ATX Style Heading

Setext Style Heading
====================
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/heading-style': ['error', { style: 'consistent' }] })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/heading-style')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD018 - no-missing-space-atx', () => {
  it('should flag missing space after hash', async () => {
    const content = `#Heading without space
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-missing-space-atx')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag proper space after hash', async () => {
    const content = `# Heading with space
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
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

describe('MD019 - no-multiple-space-atx', () => {
  it('should flag multiple spaces after hash', async () => {
    const content = `##  Heading with multiple spaces
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-multiple-space-atx')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD023 - heading-start-left', () => {
  it('should flag indented headings', async () => {
    const content = `  # Indented heading
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/heading-start-left': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/heading-start-left')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD024 - no-duplicate-heading', () => {
  it('should flag duplicate headings', async () => {
    const content = `# Same Heading

Some content

# Same Heading
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-duplicate-heading': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-duplicate-heading')
    }
    finally {
      console.log = originalLog
    }
  })
})

describe('MD025 - single-title', () => {
  it('should flag multiple h1 headings', async () => {
    const content = `# First H1

# Second H1
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
})

describe('MD026 - no-trailing-punctuation', () => {
  it('should flag trailing punctuation in headings', async () => {
    const content = `# Heading with punctuation.
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-punctuation': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath }

    const originalLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    try {
      await runLint([tempPath], options)
      console.log = originalLog

      const result = JSON.parse(output)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].ruleId).toBe('markdown/no-trailing-punctuation')
    }
    finally {
      console.log = originalLog
    }
  })

  it('should not flag headings without punctuation', async () => {
    const content = `# Proper Heading
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-punctuation': 'error' })
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
