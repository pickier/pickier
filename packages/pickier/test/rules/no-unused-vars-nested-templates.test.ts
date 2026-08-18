import { describe, expect, it } from 'bun:test'
import { noUnusedVarsRule } from '../../src/rules/general/no-unused-vars'

/**
 * A template literal inside another template's `${}`.
 *
 * The tokenizers here tracked strings with a single "am I in one" flag, so the
 * inner backtick of
 *
 *     return `'${String(value).replace(/'/g, `'\\''`)}'`
 *
 * closed the *outer* template rather than opening a nested one. Every quote
 * after it flipped the state the wrong way, the desync survived to the end of
 * the file, and the next function's body scanned as empty - so its parameter
 * was reported unused, which `--fix` would then rename while the body kept
 * using it.
 *
 * Found in a shell-quoting helper, which is where this shape naturally occurs:
 * quoting a quote means writing quotes inside quotes.
 */

function lint(source: string): { message: string }[] {
  const context = { filePath: 'sample.ts', options: {} } as never
  return (noUnusedVarsRule.check(source, context) ?? []) as { message: string }[]
}

describe('a template nested inside a template', () => {
  it('does not make the next function\'s parameter look unused', () => {
    const source = [
      'export function quote(value: string): string {',
      '  return `\'${String(value).replace(/\'/g, `\'\\\\\'\'`)}\'`',
      '}',
      '',
      'export function plan(input: { sha: string, source: string }): string {',
      '  const source = `file://${input.source}`',
      '',
      '  return quote(source) + input.sha',
      '}',
      '',
    ].join('\n')

    expect(lint(source).map(one => one.message)).toEqual([])
  })

  it('nor a variable declared after it', () => {
    const source = [
      'const shell = `\'${`inner`}\'`',
      'const used = shell.length',
      '',
      'export function size(): number {',
      '  return used',
      '}',
      '',
    ].join('\n')

    expect(lint(source).map(one => one.message)).toEqual([])
  })

  it('and still reports a parameter that really is unused', () => {
    // The fix must not be "stop looking": a desynced scanner that reports
    // nothing is as wrong as one that reports everything.
    const source = [
      'export function quote(value: string): string {',
      '  return `\'${value}\'`',
      '}',
      '',
      'export function plan(input: { sha: string }): string {',
      '  return quote(\'x\')',
      '}',
      '',
    ].join('\n')

    expect(lint(source).map(one => one.message).join(' ')).toContain('\'input\' is defined but never used')
  })
})
