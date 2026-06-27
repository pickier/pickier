import { describe, expect, it } from 'bun:test'
import { maskInlineCode, replaceOutsideInlineCode } from '../../../src/rules/markdown/_fence-tracking'

// Helpers underpinning the emphasis/strong fixers. They must rewrite prose
// while leaving inline code spans (and their backticks) byte-for-byte intact —
// otherwise fixers corrupt literals like `reverse_proxy`.

describe('replaceOutsideInlineCode', () => {
  const upper = (s: string) => s.toUpperCase()

  it('transforms a line with no code spans', () => {
    expect(replaceOutsideInlineCode('hello world', upper)).toBe('HELLO WORLD')
  })

  it('leaves a single code span verbatim', () => {
    expect(replaceOutsideInlineCode('say `hello` now', upper)).toBe('SAY `hello` NOW')
  })

  it('handles multiple code spans on one line', () => {
    expect(replaceOutsideInlineCode('`a` mid `b` end', upper)).toBe('`a` MID `b` END')
  })

  it('handles a code span at the start of the line', () => {
    expect(replaceOutsideInlineCode('`code` after', upper)).toBe('`code` AFTER')
  })

  it('handles a code span at the end of the line', () => {
    expect(replaceOutsideInlineCode('before `code`', upper)).toBe('BEFORE `code`')
  })

  it('handles adjacent code spans', () => {
    expect(replaceOutsideInlineCode('`a``b`', upper)).toBe('`a``b`')
  })

  it('respects double-backtick spans (which may contain a single backtick)', () => {
    expect(replaceOutsideInlineCode('x ``a`b`` y', upper)).toBe('X ``a`b`` Y')
  })

  it('treats an unterminated backtick run as literal text', () => {
    // No matching close — the backtick is prose, so the tail still transforms.
    expect(replaceOutsideInlineCode('a `b c', upper)).toBe('A `B C')
  })

  it('pairs backticks left-to-right like CommonMark', () => {
    // First ` pairs with the next ` → span is `` ` b ` ``; the trailing
    // backtick is then unpaired, so `code` sits OUTSIDE and is transformed.
    const out = replaceOutsideInlineCode('a ` b `code` d', upper)
    expect(out).toBe('A ` b `CODE` D')
  })

  it('only matches a closing run of the SAME length', () => {
    // `` opens a 2-tick span; the single tick inside is content, closed by ``.
    expect(replaceOutsideInlineCode('``x`y`` z', upper)).toBe('``x`y`` Z')
  })

  it('returns the empty string unchanged', () => {
    expect(replaceOutsideInlineCode('', upper)).toBe('')
  })

  it('does not corrupt underscores inside a code span', () => {
    const toStar = (s: string) => s.replace(/_/g, '*')
    expect(replaceOutsideInlineCode('`reverse_proxy` and a_b', toStar))
      .toBe('`reverse_proxy` and a*b')
  })
})

describe('maskInlineCode', () => {
  it('blanks code spans while preserving overall length', () => {
    const line = 'say `hello` now'
    const masked = maskInlineCode(line)
    expect(masked.length).toBe(line.length)
    expect(masked).not.toContain('`')
    expect(masked).not.toContain('h') // span content gone
    expect(masked.startsWith('say ')).toBe(true)
    expect(masked.endsWith(' now')).toBe(true)
  })

  it('preserves column positions of text outside spans', () => {
    const line = 'a `xx` b'
    const masked = maskInlineCode(line)
    // 'b' must remain at the same index after masking.
    expect(masked.indexOf('b')).toBe(line.indexOf('b'))
    expect(masked.indexOf('a')).toBe(0)
  })

  it('hides markers inside code so detectors skip them', () => {
    const masked = maskInlineCode('use `a_b` here')
    expect(masked).not.toContain('_')
    expect(masked.startsWith('use ')).toBe(true)
    expect(masked.endsWith(' here')).toBe(true)
  })

  it('leaves a line without code spans untouched', () => {
    expect(maskInlineCode('plain text')).toBe('plain text')
  })

  it('masks multiple spans, preserving length and outside text', () => {
    const line = '`a` x `bb`'
    const masked = maskInlineCode(line)
    expect(masked.length).toBe(line.length)
    expect(masked).not.toContain('`')
    expect(masked.indexOf('x')).toBe(line.indexOf('x'))
  })
})
