import type { LintOptions } from '../../../src/types'
import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runLint } from '../../../src/linter'
import { cleanupTempFiles, createConfigWithMarkdownRules, createTempFile } from './test-helpers'

afterEach(() => cleanupTempFiles())

// Regression for https://github.com/pickier/pickier/issues/1354
// `pickier --fix` previously deleted body content from markdown files that
// combined YAML frontmatter with blank lines: the markdownOnly fix wrapper
// blanked the frontmatter, ran the rule, then sliced N lines back off — when
// no-multiple-blanks collapsed those leading blanks, the slice cut into real
// body content, compounding across the 5-pass fixer loop.
describe('Markdown frontmatter + fix safety (issue #1354)', () => {
  it('does not delete body content when no-multiple-blanks runs after frontmatter', async () => {
    const content = `---
title: Markdown Features
description: BunPress markdown features
---

# Markdown Features

BunPress supports VitePress-compatible markdown features.

## Custom Containers

::: info
This is an informational message.
:::

::: tip
Here's a helpful tip for you!
:::

### Code Groups

:::code-group
\`\`\`ts [config.ts]
export default { port: 3000 }
\`\`\`
:::
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-blanks': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(content)
  })

  it('still collapses excessive blank lines inside the body', async () => {
    const content = `---
title: Test
---

# Heading



Paragraph with too many blank lines above.
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({ 'markdown/no-multiple-blanks': 'error' })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed).toBe(`---
title: Test
---

# Heading

Paragraph with too many blank lines above.
`)
  })

  it('preserves frontmatter exactly when applying any markdown fixers', async () => {
    const content = `---
title: Frontmatter Preservation
tags:
  - one
  - two
---

# Heading

Some content.
`
    const tempPath = createTempFile(content)
    const configPath = createConfigWithMarkdownRules({
      'markdown/no-multiple-blanks': 'error',
      'markdown/single-trailing-newline': 'error',
      'markdown/no-trailing-spaces': 'error',
    })
    const options: LintOptions = { reporter: 'json', config: configPath, fix: true }

    await runLint([tempPath], options)
    const fixed = readFileSync(tempPath, 'utf8')
    expect(fixed.startsWith('---\ntitle: Frontmatter Preservation\ntags:\n  - one\n  - two\n---\n')).toBe(true)
    expect(fixed).toContain('# Heading')
    expect(fixed).toContain('Some content.')
  })
})
