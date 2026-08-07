import { describe, expect, it } from 'bun:test'
import { maskCommentText, noUnusedVarsRule } from '../../src/rules/general/no-unused-vars'

/**
 * A regex literal is not a comment.
 *
 * A pattern that ends in an escaped slash closes with `\/` immediately
 * followed by the real delimiter. The comment masker tracked strings but not
 * regexes, so it read that pair as the start of a line comment and blanked
 * everything after it:
 *
 *     return /^https?:\/\//.test(baseUrl) ? baseUrl : `https://${baseUrl}`
 *
 * All three uses of `baseUrl` vanished, the rule called a working parameter
 * unused, and `--fix` renamed it to `_baseUrl` while the body kept saying
 * `baseUrl` — a false positive turned into a runtime error by the autofix.
 */

function lint(source: string): { message: string }[] {
  const context = { filePath: 'sample.ts', options: {} } as never
  return (noUnusedVarsRule.check(source, context) ?? []) as { message: string }[]
}

describe('maskCommentText and regex literals', () => {
  it('leaves a pattern containing escaped slashes intact', () => {
    const source = 'return /^https?:\\/\\//.test(baseUrl) ? baseUrl : tail'

    expect(maskCommentText(source)).toBe(source)
  })

  it('still blanks a real line comment', () => {
    expect(maskCommentText('const a = 1 // secret')).toBe('const a = 1 //       ')
  })

  it('still blanks a real block comment', () => {
    expect(maskCommentText('/* secret */ const b = 2')).toBe('/*        */ const b = 2')
  })

  it('does not mistake division for a pattern', () => {
    const source = 'const rate = total / count / 2'

    expect(maskCommentText(source)).toBe(source)
  })

  it('handles a slash inside a character class', () => {
    const source = 'const m = s.match(/[/a-z]+/g) && used'

    expect(maskCommentText(source)).toBe(source)
  })

  it('does not let an unterminated pattern swallow the file', () => {
    // A stray slash must not blank everything below it.
    const masked = maskCommentText('const bad = /unterminated\nconst kept = used')

    expect(masked).toContain('const kept = used')
  })

  it('leaves a URL inside a string alone', () => {
    const source = 'const u = "https://example.com" + kept'

    expect(maskCommentText(source)).toBe(source)
  })
})

describe('no-unused-vars with regex literals', () => {
  it('sees a parameter used only after a regex on the same line', () => {
    const source = [
      'export function createUpdateManifestUrl(baseUrl: string): string {',
      '  return /^https?:\\/\\//.test(baseUrl) ? baseUrl : `https://${baseUrl}`',
      '}',
    ].join('\n')

    expect(lint(source).filter(f => f.message.includes('baseUrl'))).toHaveLength(0)
  })

  it('still reports a parameter that genuinely is not used', () => {
    const source = [
      'export function ignoresIt(alpha: string, beta: string): string {',
      '  return /^https?:\\/\\//.test(alpha) ? alpha : alpha',
      '}',
    ].join('\n')

    expect(lint(source).filter(f => f.message.includes('beta')).length).toBeGreaterThan(0)
  })
})
