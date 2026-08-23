/**
 * An overload signature has no body, so its parameters cannot be unused in one.
 *
 * The rule finds a function's body by scanning forward for the next `{`. An
 * overload declaration has none of its own, so the scan ran on and found the
 * IMPLEMENTATION's body, then checked the overload's parameter names against
 * it. Overload parameter names do not have to match the implementation's - that
 * is most of the point of writing one - so every name that differed was
 * reported as unused, on a signature that has no body to use anything in.
 *
 * The shape that surfaced it is the ordinary one for a function whose arity
 * depends on a type:
 *
 *   export function url<TName extends KnownRouteName>(
 *     name: TName,
 *     ...rest: RequiresParams<TName> extends true ? [p: P] : [p?: P]
 *   ): string
 *   export function url(name: string, params = {}): string { … }
 *
 * TypeScript reports nothing here. The only available workaround was an
 * `eslint-disable-next-line` on correct code, or renaming a public API's
 * parameter to `_name` - which is worse, because the name shows up in editor
 * hints at every call site.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'

function project(source: string): { dir: string, config: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pickier-unused-overloads-'))
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

describe('no-unused-vars: overload signatures', () => {
  it('does not report a multi-line overload whose rest param has a conditional type', async () => {
    const source = [
      'type Opts = { a?: number }',
      '',
      'export function url<T extends string>(',
      '  name: T,',
      '  ...rest: T extends \'x\'',
      '    ? [params: Opts, options?: Opts]',
      '    : [params?: Opts, options?: Opts]',
      '): string',
      'export function url(',
      '  name: string,',
      '  params: Opts = {},',
      '): string {',
      '  return `${name}${JSON.stringify(params)}`',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('does not report an overload whose parameter names differ from the implementation', async () => {
    const source = [
      'export function pick(first: string): string',
      'export function pick(first: string, second: string): string',
      'export function pick(a: string, b?: string): string {',
      '  return b ? a + b : a',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('does not report a declaration terminated with a semicolon', async () => {
    const source = [
      'export declare function ambient(name: string, count: number): string;',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('still reports a parameter the implementation really does not use', async () => {
    // The guard must not become a blanket exemption: this has a body, and
    // `unused` is not in it.
    const source = [
      'export function real(used: string, unused: number): string {',
      '  return used',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(1)
  })

  it('still reports an unused parameter on a multi-line implementation', async () => {
    const source = [
      'export function spread(',
      '  used: string,',
      '  unused: number,',
      '): string {',
      '  return used',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(1)
  })
})
