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

/**
 * A regex in the commonest position of all.
 *
 * `stripRegex` decided a `/` opened a pattern by looking at the preceding
 * character, from a set that omitted `>` — so `line => /…/.test(line)` was not
 * recognised as a regex and was left in place. That only mattered when the
 * pattern held a quote, as a character class of quote characters does:
 *
 *     pairs.every(line => /^[^=]+=\s*["']?(?:encrypted|enc):/.test(line))
 *
 * The string stripper then read that `'` as opening a string and blanked
 * everything to the next one, several lines away — taking the parameter's only
 * use with it. The rule called a working parameter unused, and `--fix` renames
 * it, which turns the false positive into a runtime error.
 */
describe('a regex following an arrow', () => {
  it('does not lose a parameter used before a quoted character class', () => {
    const source = [
      'export function isEncrypted(contents: string): boolean {',
      '  const pairs = contents.split(String.fromCharCode(10))',
      '',
      '  return pairs.every(line => /^[^=]+=\\s*["\']?(?:encrypted|enc):/.test(line))',
      '}',
      '',
    ].join('\n')

    expect(lint(source)).toEqual([])
  })

  it('still reports one that really is unused', () => {
    // The guard against fixing the false positive by disabling the rule.
    const source = [
      'export function isEncrypted(contents: string): boolean {',
      '  return /^["\']/.test(String(1))',
      '}',
      '',
    ].join('\n')

    expect(lint(source).map(issue => issue.message).join(' ')).toContain('contents')
  })
})
