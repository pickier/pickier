import { describe, expect, it } from 'bun:test'
import { stylePlugin } from '../../../src/plugins/style'

/**
 * The style plugin's whitespace rules cover any text file except Markdown,
 * where spacing is syntax: two trailing spaces are a hard line break, and
 * runs of spaces align code blocks and tables. Their fixers once collapsed
 * that spacing across the docs; the markdown plugin has its own rules.
 */
const markdown = [
  '# Title',
  '',
  'First line with a hard break  ',
  'second line.',
  '',
  '```bash',
  'bun test          # all tests',
  'bun run test:core # core only',
  '```',
  '',
  '',
  '| a   | b |',
  '',
].join('\n')

const rules = ['no-multi-spaces', 'no-multiple-empty-lines', 'no-trailing-spaces'] as const

describe('style whitespace rules and Markdown', () => {
  for (const name of rules) {
    const rule = stylePlugin.rules[name]!

    it(`${name} leaves Markdown alone`, () => {
      const ctx = { filePath: 'docs/guide.md', config: {} as any }
      expect(rule.check(markdown, ctx)).toEqual([])
      if (rule.fix)
        expect(rule.fix(markdown, ctx)).toBe(markdown)
    })

    it(`${name} still checks other text files`, () => {
      expect(rule.check(markdown, { filePath: 'notes.txt', config: {} as any }).length).toBeGreaterThan(0)
    })
  }
})
