import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

describe('Edge Cases: no-missing-space-atx fixer', () => {
  it('should fix multiple headings without spaces', async () => {
    const content = `#Heading 1
##Heading 2
###Heading 3
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`# Heading 1
## Heading 2
### Heading 3
`)
  })

  it('should not modify headings with proper spacing', async () => {
    const content = `# Heading 1
## Heading 2
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })

  it('should fix headings with numbers immediately after hash', async () => {
    const content = `#123 Heading
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`# 123 Heading
`)
  })
})

describe('Edge Cases: no-multiple-space-atx fixer', () => {
  it('should fix various amounts of spaces', async () => {
    const content = `#  Two spaces
##   Three spaces
###    Four spaces
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`# Two spaces
## Three spaces
### Four spaces
`)
  })

  it('should preserve single space', async () => {
    const content = `# Already correct
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })
})

describe('Edge Cases: no-trailing-punctuation fixer', () => {
  it('should remove multiple trailing punctuation marks', async () => {
    const content = `# Heading...
## Another!!!
### What???
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-punctuation': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`# Heading
## Another
### What
`)
  })

  it('should handle mixed punctuation', async () => {
    const content = `# Heading.,;:!?
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-punctuation': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`# Heading
`)
  })

  it('should preserve punctuation in middle of heading', async () => {
    const content = `# What? Where is it
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-punctuation': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })

  it('should work with custom punctuation option', async () => {
    const content = `# Heading!
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-punctuation': ['error', { punctuation: '!' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`# Heading
`)
  })
})

describe('Edge Cases: no-trailing-spaces fixer', () => {
  it('should remove various amounts of trailing spaces', async () => {
    const content = 'Line with 1 space \nLine with 3 spaces   \nLine with 5 spaces     \n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-spaces': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('Line with 1 space\nLine with 3 spaces\nLine with 5 spaces\n')
  })

  it('should preserve exactly 2 spaces for hard line breaks when configured', async () => {
    const content = 'Line with 2 spaces  \nNext line\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-spaces': ['error', { br_spaces: 2 }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content) // Should preserve 2 spaces
  })

  it('should remove all trailing spaces when br_spaces is 0', async () => {
    const content = 'Line with 2 spaces  \n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-spaces': ['error', { br_spaces: 0 }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('Line with 2 spaces\n')
  })
})

describe('Edge Cases: no-hard-tabs fixer', () => {
  it('should convert multiple tabs to spaces', async () => {
    const content = '\tOne tab\n\t\tTwo tabs\n\t\t\tThree tabs\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-hard-tabs': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('    One tab\n        Two tabs\n            Three tabs\n')
  })

  it('should handle mixed tabs and spaces', async () => {
    const content = '\t  Mixed\n  \tAlso mixed\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-hard-tabs': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('      Mixed\n      Also mixed\n')
  })
})

describe('Edge Cases: ul-style fixer', () => {
  it('should convert all markers to first found style (consistent)', async () => {
    const content = `* First item
+ Second item
- Third item
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-style': ['error', { style: 'consistent' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`* First item
* Second item
* Third item
`)
  })

  it('should convert to specific marker style', async () => {
    const content = `* First
+ Second
- Third
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-style': ['error', { style: 'dash' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`- First
- Second
- Third
`)
  })

  it('should preserve indentation when converting markers', async () => {
    const content = `* Item
  + Nested
    - Deep nested
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ul-style': ['error', { style: 'asterisk' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`* Item
  * Nested
    * Deep nested
`)
  })
})

describe('Edge Cases: ol-prefix fixer', () => {
  it('should renumber ordered list sequentially', async () => {
    const content = `1. First
1. Second
1. Third
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ol-prefix': ['error', { style: 'ordered' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`1. First
2. Second
3. Third
`)
  })

  it('should reset numbering after blank line', async () => {
    const content = `1. First
2. Second

1. New list first
2. New list second
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ol-prefix': ['error', { style: 'ordered' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content) // Already correct
  })

  it('should convert all to "1." style', async () => {
    const content = `1. First
2. Second
3. Third
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/ol-prefix': ['error', { style: 'one' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`1. First
1. Second
1. Third
`)
  })
})

describe('Edge Cases: emphasis and strong style fixers', () => {
  it('should convert nested emphasis and strong', async () => {
    const content = `**bold _and italic_**
_italic **and bold**_
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({
      'markdown/emphasis-style': ['error', { style: 'asterisk' }],
      'markdown/strong-style': ['error', { style: 'asterisk' }],
    })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`**bold *and italic***
*italic **and bold***
`)
  })

  it('should handle multiple emphasis markers in same line', async () => {
    const content = `_first_ and _second_ and __strong__ text
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({
      'markdown/emphasis-style': ['error', { style: 'asterisk' }],
      'markdown/strong-style': ['error', { style: 'asterisk' }],
    })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`*first* and *second* and **strong** text
`)
  })

  it('should not convert underscores inside inline code spans across lines', async () => {
    // Regression: the whole-text fixer paired the lone `_` in `reverse_proxy`
    // with the lone `_` in `proxy_pass` (a line later) and rewrote both to `*`.
    const content = `| \`caddy\` | \`caddy reverse_proxy\`. |
| \`nginx\` | \`nginx proxy_pass\` with upstream keepalive. |
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({
      'markdown/emphasis-style': ['error', { style: 'asterisk' }],
    })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })
})

describe('Edge Cases: no-space-in-code fixer', () => {
  it('should handle multiple code spans in same line', async () => {
    const content = '`  code1  ` and `  code2  ` in one line\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-space-in-code': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    // After fixing, both code spans should have spaces removed
    expect(fixed).toContain('`code1`')
    expect(fixed).toContain('`code2`')
    expect(fixed).not.toContain('`  code1  `')
    expect(fixed).not.toContain('`  code2  `')
  })

  it('should not modify code spans without extra spaces', async () => {
    const content = '`correct` code span\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-space-in-code': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })
})

describe('Edge Cases: no-bare-urls fixer', () => {
  it('should wrap multiple bare URLs in same line', async () => {
    const content = 'Visit https://example.com and https://another.com for info\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-bare-urls': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('Visit <https://example.com> and <https://another.com> for info\n')
  })

  it('should not wrap URLs already in angle brackets', async () => {
    const content = 'Visit <https://example.com> for info\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-bare-urls': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })

  it('should not wrap URLs in markdown links', async () => {
    const content = '[Link](https://example.com) text\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-bare-urls': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })

  it('should handle both http and https URLs', async () => {
    const content = 'Visit http://example.com and https://secure.com\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-bare-urls': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('Visit <http://example.com> and <https://secure.com>\n')
  })
})

describe('Edge Cases: code-fence-style fixer', () => {
  it('should convert multiple code blocks consistently', async () => {
    const content = '```js\ncode1\n```\n\n~~~python\ncode2\n~~~\n\n```\ncode3\n```\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/code-fence-style': ['error', { style: 'backtick' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('```js\ncode1\n```\n\n```python\ncode2\n```\n\n```\ncode3\n```\n')
  })

  it('should preserve language specifiers when converting', async () => {
    const content = '~~~typescript\nconst x = 1;\n~~~\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/code-fence-style': ['error', { style: 'backtick' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('```typescript\nconst x = 1;\n```\n')
  })

  it('should use consistent style based on first fence found', async () => {
    const content = '~~~\nfirst\n~~~\n\n```\nsecond\n```\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/code-fence-style': ['error', { style: 'consistent' }] })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('~~~\nfirst\n~~~\n\n~~~\nsecond\n~~~\n')
  })
})

describe('Edge Cases: blanks-around-fences fixer', () => {
  it('should add blank lines when missing around multiple fences', async () => {
    const content = 'Text\n```\ncode\n```\nMore text\n```\ncode2\n```\nEnd\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-fences': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toContain('\n\n```')
    expect(fixed).toContain('```\n\n')
  })

  it('should not add extra blank lines if already present', async () => {
    const content = 'Text\n\n```\ncode\n```\n\nMore text\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-fences': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    // Should not add excessive blank lines
    expect(fixed).not.toContain('\n\n\n')
  })
})

describe('Edge Cases: blanks-around-lists fixer', () => {
  it('should add blank lines around multiple separate lists', async () => {
    const content = 'Text\n- Item 1\n- Item 2\nMore text\n1. Item\n2. Item\nEnd\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-lists': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    // Should have blank lines before and after lists
    expect(fixed).toContain('\n\n-')
    expect(fixed).toContain('\n\n1.')
  })

  it('should not separate list items within same list', async () => {
    const content = '\n- Item 1\n- Item 2\n- Item 3\n\n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/blanks-around-lists': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    // Items in same list should stay together
    expect(fixed).toBe('\n- Item 1\n- Item 2\n- Item 3\n\n')
  })
})

describe('Edge Cases: Combined fixers', () => {
  it('should apply multiple fixers in same file', async () => {
    const content = `#Heading.
Line with spaces
\tTabbed line
* item
+ item
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({
      'markdown/no-missing-space-atx': 'error',
      'markdown/no-trailing-punctuation': 'error',
      'markdown/no-trailing-spaces': 'error',
      'markdown/no-hard-tabs': 'error',
      'markdown/ul-style': ['error', { style: 'asterisk' }],
    })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`# Heading
Line with spaces
    Tabbed line
* item
* item
`)
  })

  it('should handle idempotent fixes (running twice gives same result)', async () => {
    const content = `#Heading
##Another
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    // First fix
    await runLint([tempPath], options)
    const firstFix = readFileSync(tempPath, 'utf8')

    // Second fix on already fixed content
    writeFileSync(tempPath, firstFix)
    await runLint([tempPath], options)
    const secondFix = readFileSync(tempPath, 'utf8')

    expect(firstFix).toBe(secondFix)
  })
})

describe('Edge Cases: Empty and minimal files', () => {
  it('should handle empty file', async () => {
    const content = ''
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-spaces': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })

  it('should handle file with only whitespace', async () => {
    const content = '   \n  \n \n'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-trailing-spaces': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    // After fixing, the file should have changed (trailing spaces removed)
    expect(fixed).not.toBe(content)
    // Should still have the newlines
    const lines = fixed.split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  it('should handle single line with no newline', async () => {
    const content = '#Heading'
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-missing-space-atx': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe('# Heading')
  })
})
