/**
 * An apostrophe in a comment is prose, not a quote.
 *
 * The rule finds uses of a declaration with a set of small hand-written
 * scanners, and each one decides whether it is inside a string by watching for
 * a quote character. None of them knew about comments, so ordinary English
 * opened a string that nothing closed:
 *
 *   const markup = createWriter()
 *   \/** The document's raw HTML. *\/
 *   const prose = (c) => markup.write(c, t => linkify(t, context))
 *
 * Everything after `document'` read as string content, so the uses below it
 * were never seen and the parameters were reported as unused - on a file that
 * compiles and runs. The autofix then offers to rename them to `_name` while
 * the body still says `name`, which is the part that makes this worth a test:
 * a false positive is noise, and an autofix that breaks working code is not.
 *
 * Comments are dense prose in plenty of codebases. This is not an edge case;
 * it is every second paragraph.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'
import { maskCommentText } from '../../src/rules/general/no-unused-vars'

function project(source: string): { dir: string, config: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pickier-unused-comments-'))
  writeFileSync(join(dir, 'subject.ts'), source, 'utf8')

  const config = join(dir, 'pickier.config.json')
  writeFileSync(config, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/no-unused-vars': 'error' },
  }), 'utf8')

  return { dir, config }
}

async function lint(source: string): Promise<number> {
  const { dir, config } = project(source)

  return runLint([dir], { config, reporter: 'json', cache: false } as any)
}

/** The shape that started it, reduced. */
const APOSTROPHE = [
  'export function render(source: string, context: number): string {',
  '  if (!source)',
  '    return \'\'',
  '',
  '  /**',
  '   * The document\'s raw HTML.',
  '   */',
  '  const markup = { write: (a: string, b: (t: string) => string) => b(a) }',
  '',
  '  return markup.write(source, text => `${text}${context}`)',
  '}',
  '',
].join('\n')

describe('no-unused-vars and prose in comments', () => {
  it('does not report parameters used after an apostrophe in a block comment', async () => {
    expect(await lint(APOSTROPHE)).toBe(0)
  })

  it('does not report them after an apostrophe in a line comment either', async () => {
    const source = [
      'export function greet(name: string): string {',
      '  // the caller\'s name',
      '  return `hello ${name}`',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  /** An odd number of quotes is the failing case; an even number always worked. */
  it('copes with a single unpaired double quote in prose', async () => {
    const source = [
      'export function quote(word: string): string {',
      '  // opens with a " and never closes it',
      '  return word',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('still reports a parameter that really is unused', async () => {
    const source = [
      'export function unused(kept: string, dropped: string): string {',
      '  // the second one\'s value is ignored',
      '  return kept',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(1)
  })

  /**
   * A name that appears only in a comment is not a use, and never was meant to
   * be. Blanking the prose makes that true rather than accidental.
   */
  it('does not count a mention in a comment as a use', async () => {
    const source = [
      'export function mention(value: string): string {',
      '  // returns value',
      '  return \'\'',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(1)
  })
})

describe('maskCommentText', () => {
  it('keeps the delimiters and blanks what is between them', () => {
    expect(maskCommentText('a // hi\nb')).toBe('a //   \nb')
    expect(maskCommentText('a /* hi */ b')).toBe('a /*    */ b')
  })

  it('keeps every offset and every line break', () => {
    const source = 'const a = 1 // one\nconst b = 2 /* two\nthree */\n'
    const masked = maskCommentText(source)

    expect(masked).toHaveLength(source.length)
    expect(masked.split('\n')).toHaveLength(source.split('\n').length)
  })

  it('leaves a comment marker inside a string alone', () => {
    expect(maskCommentText('const url = \'http://example.com/a\'')).toBe('const url = \'http://example.com/a\'')
    expect(maskCommentText('const s = "/* not a comment */"')).toBe('const s = "/* not a comment */"')
  })

  it('leaves a template literal alone, newlines and all', () => {
    const source = 'const t = `line // one\nline /* two */`'

    expect(maskCommentText(source)).toBe(source)
  })

  /** An unterminated block comment runs to the end, as a parser would read it. */
  it('blanks to the end of an unterminated comment', () => {
    expect(maskCommentText('a /* b c')).toBe('a /*    ')
  })
})
