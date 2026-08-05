/**
 * Where a function's body starts, when the return type has braces in it.
 *
 * The rule finds the body by scanning past the return type for a `{`, and it
 * used to stop at the first one that followed a completed brace pair. A union
 * of object types has several, so the second member of the union was taken as
 * the body:
 *
 *   function f(raw: unknown): { ok: true, value: T } | { ok: false, error: string } {
 *                                                     ^ read as the body
 *
 * The body then read as empty, every parameter looked unused, and `--fix`
 * renamed them to `_name` while leaving the body referring to `name`. The
 * result did not compile, which is the part that makes this worth a test:
 * a false positive is noise, but an autofix that breaks working code is not.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'

function project(source: string): { dir: string, file: string, config: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pickier-unused-return-'))
  const file = join(dir, 'subject.ts')
  writeFileSync(file, source, 'utf8')

  const config = join(dir, 'pickier.config.json')
  writeFileSync(config, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/no-unused-vars': 'error' },
  }), 'utf8')

  return { dir, file, config }
}

async function lint(source: string): Promise<number> {
  const { dir, config } = project(source)

  return runLint([dir], { config, reporter: 'json', cache: false } as any)
}

/** The shape that started it: a union of two object types. */
const UNION_RETURN = [
  'export function description(raw: unknown): { ok: true, value: string | null } | { ok: false, error: string } {',
  '  if (raw === undefined || raw === null)',
  '    return { ok: true, value: null }',
  '',
  '  const text = String(raw).trim()',
  '  if (text.length > 200)',
  '    return { ok: false, error: \'too long\' }',
  '',
  '  return { ok: true, value: text || null }',
  '}',
  '',
].join('\n')

describe('no-unused-vars and brace-carrying return types', () => {
  it('does not report a parameter used in a function returning a union of object types', async () => {
    expect(await lint(UNION_RETURN)).toBe(0)
  })

  it('still finds the body after a single object return type', async () => {
    const source = [
      'export function one(raw: unknown): { value: string } {',
      '  return { value: String(raw) }',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('handles three members, so the fix is not "skip exactly one"', async () => {
    const source = [
      'export function three(raw: unknown): { a: string } | { b: string } | { c: string } {',
      '  return { a: String(raw) }',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('handles an intersection as well as a union', async () => {
    const source = [
      'export function both(raw: unknown): { a: string } & { b: string } {',
      '  return { a: String(raw), b: String(raw) }',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('handles a generic wrapping the object types', async () => {
    const source = [
      'export function wrapped(raw: unknown): Promise<{ ok: true } | { ok: false }> {',
      '  return Promise.resolve(raw ? { ok: true } : { ok: false })',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  /**
   * The same scan, when the annotation runs past the end of the line.
   *
   * `): {` on its own was handled; `): Promise<{` was not, and the difference
   * is one character. The generic's brace was taken for the body, so the body
   * read as the annotation and every parameter in it looked unused.
   */
  it('finds the body after a multi-line generic return type', async () => {
    const source = [
      'export async function paged(raw: unknown): Promise<{',
      '  items: string[]',
      '}> {',
      '  return { items: [String(raw)] }',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('finds the body after a multi-line object return type', async () => {
    const source = [
      'export function paged(raw: unknown): {',
      '  items: string[]',
      '} {',
      '  return { items: [String(raw)] }',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('still reports an unused parameter under a multi-line generic return type', async () => {
    const source = [
      'export async function paged(raw: unknown): Promise<{',
      '  items: string[]',
      '}> {',
      '  return { items: [] }',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(1)
  })

  /** The rule still has to work, or the fix above is just switching it off. */
  it('still reports a parameter that genuinely is unused', async () => {
    const source = [
      'export function unused(raw: unknown): { ok: true, value: null } | { ok: false } {',
      '  return { ok: true, value: null }',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(1)
  })

  /**
   * The part that broke code rather than merely complaining about it.
   *
   * Whatever `--fix` does to a parameter, it has to do to the body too, or the
   * file stops compiling.
   */
  it('never leaves a fixed file referring to a parameter it renamed', async () => {
    const { dir, file, config } = project(UNION_RETURN)
    await runLint([dir], { config, reporter: 'json', cache: false, fix: true } as any)

    const fixed = readFileSync(file, 'utf8')
    const renamed = /\b_raw\b/.test(fixed)
    const stillUsesOriginal = /[^_\w]raw\b/.test(fixed)

    expect(renamed && stillUsesOriginal).toBe(false)
  })
})

/**
 * A constant declared below the function that uses it.
 *
 * The scan looked forwards from the declaration only, so a `const` at the
 * bottom of a module read as unused - and the autofix for "unused" renames it
 * to `_name` while the use above still says `name`, which does not compile.
 */
describe('a declaration used above itself', () => {
  it('does not report a constant used earlier in the file', async () => {
    const source = [
      'export function take(list: string[]): string[] {',
      '  return list.slice(0, LIMIT)',
      '}',
      '',
      'const LIMIT = 50',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('still reports one that is genuinely used nowhere', async () => {
    const source = [
      'export function take(list: string[]): string[] {',
      '  return list.slice(0, 10)',
      '}',
      '',
      'const LIMIT = 50',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(1)
  })
})

/**
 * A type predicate is a return type, not a parameter.
 *
 * `(entry): entry is Thing => ...` puts `Thing` immediately before the arrow,
 * which is exactly where a bare-identifier parameter sits. The rule reported
 * the *type* as an unused parameter, and `--fix` would have renamed it to
 * `_Thing`, which does not compile.
 */
describe('a type predicate', () => {
  it('is not read as a parameter', async () => {
    const source = [
      'interface Thing { a: number }',
      '',
      'export function keep(list: unknown[], base: Thing[]): Thing[] {',
      '  const out: Thing[] = [',
      '    ...base,',
      '    ...list.map(entry => entry as Thing | null).filter((entry): entry is Thing => entry != null),',
      '  ]',
      '  return out',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })
})
