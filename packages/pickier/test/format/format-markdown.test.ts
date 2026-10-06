/**
 * formatCode() on markdown: whitespace normalization that never changes what
 * the document renders or what its code samples contain.
 */
import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { formatCode } from '../../src/format'

const fmt = (src: string, file = 'doc.md') => formatCode(src, defaultConfig, file)

describe('markdown formatting', () => {
  it('trims trailing whitespace in prose and collapses blank runs', () => {
    expect(fmt('# Title \n\n\n\nSome text.\t\n')).toBe('# Title\n\nSome text.\n')
  })

  it('turns whitespace-only lines into blank lines', () => {
    expect(fmt('a\n   \n  \nb\n')).toBe('a\n\nb\n')
  })

  it('keeps a fenced code block verbatim, trailing spaces and blank runs included', () => {
    const src = [
      '```js',
      'const s = `line one ',
      'line two`;',
      '',
      '',
      '',
      'foo()  ',
      '```',
      '',
    ].join('\n')
    expect(fmt(src)).toBe(src)
  })

  it('keeps tilde fences and longer fences verbatim until the matching close', () => {
    const src = [
      '````md',
      '```js',
      'x  ',
      '```',
      '',
      '',
      'y ',
      '````',
      'after ',
      '',
    ].join('\n')
    expect(fmt(src)).toBe(src.replace('after ', 'after'))
    const tilde = '~~~\nkeep \n~~~\n'
    expect(fmt(tilde)).toBe(tilde)
  })

  it('does not close a backtick fence on a line that has an info string', () => {
    const src = '```\na \n```js\nb \n```\nc \n'
    expect(fmt(src)).toBe('```\na \n```js\nb \n```\nc\n')
  })

  it('treats an unclosed fence as running to the end of the document', () => {
    const src = '```\na \n\n\n\nb \n'
    expect(fmt(src)).toBe(src)
  })

  it('preserves hard line breaks, normalized to two spaces', () => {
    expect(fmt('first  \nsecond\n')).toBe('first  \nsecond\n')
    expect(fmt('first    \nsecond\n')).toBe('first  \nsecond\n')
  })

  it('trims trailing spaces that are not a hard break', () => {
    // End of paragraph: the next line is blank, so there is no break to keep
    expect(fmt('first  \n\nsecond\n')).toBe('first\n\nsecond\n')
    // End of document
    expect(fmt('last  ')).toBe('last\n')
    // A single trailing space is never a break
    expect(fmt('first \nsecond\n')).toBe('first\nsecond\n')
    // Headings cannot carry a hard break
    expect(fmt('# Title  \ntext\n')).toBe('# Title\ntext\n')
  })

  it('is idempotent', () => {
    const src = 'a  \nb\n\n\n```\nc \n\n\n```\n  \n'
    const once = fmt(src)
    expect(fmt(once)).toBe(once)
  })

  it('reads backticks in prose as inline code, not template literals', () => {
    // An unbalanced backtick must not switch off trimming for the rest of the file
    expect(fmt('Use ` carefully \nnext \n')).toBe('Use ` carefully\nnext\n')
  })
})
