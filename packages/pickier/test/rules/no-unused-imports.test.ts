/**
 * Imports nothing uses.
 *
 * `no-unused-vars` covered declarations and parameters and never looked at
 * imports at all - value or type - so a binding could sit at the top of a file
 * indefinitely with nothing referring to it.
 *
 * Most of what is pinned here is not "does it find the unused one". It is the
 * three ways an early version of this rule reported imports that were being
 * used, which is the failure mode that matters: acting on this rule's output
 * means deleting a line, so a false positive breaks a build.
 *
 *   1. A dynamic `import('x').then(…)` read as an import STATEMENT. The scan
 *      then ran forward looking for a `from` clause a call expression does not
 *      have, swallowed dozens of real lines as "part of the import", and every
 *      genuinely-used name in that stretch reported as unused. One such call in
 *      the middle of a file was enough to produce 116 false positives across
 *      one repository.
 *   2. `\b` boundaries, which are defined in terms of `\w` and so cannot see
 *      `$` as part of a name - `` import { $ } from 'bun' `` followed by
 *      `` await $`echo hi` `` read as unused.
 *   3. A mis-parse yielding something that is not an identifier, interpolated
 *      straight into a `RegExp`, throwing "unmatched parentheses" and taking
 *      the rule down for that whole file.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'

function project(source: string): { dir: string, config: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pickier-unused-imports-'))
  writeFileSync(join(dir, 'subject.ts'), source, 'utf8')

  const config = join(dir, 'pickier.config.json')
  writeFileSync(config, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/no-unused-imports': 'error', 'pickier/no-unused-vars': 'off' },
  }), 'utf8')

  return { dir, config }
}

async function lint(source: string): Promise<number> {
  const { dir, config } = project(source)

  return runLint([dir], { config, reporter: 'json', cache: false } as any)
}

describe('no-unused-imports: finds them', () => {
  it('reports an unused value import', async () => {
    expect(await lint([
      'import { used, unused } from \'node:fs\'',
      '',
      'export const a = used',
      '',
    ].join('\n'))).toBe(1)
  })

  it('reports an unused type import', async () => {
    expect(await lint([
      'import type { Stats } from \'node:fs\'',
      '',
      'export const a = 1',
      '',
    ].join('\n'))).toBe(1)
  })

  it('reports an unused default import', async () => {
    expect(await lint([
      'import unusedDefault from \'a\'',
      '',
      'export const a = 1',
      '',
    ].join('\n'))).toBe(1)
  })

  it('reports an unused namespace import', async () => {
    expect(await lint([
      'import * as ns from \'a\'',
      '',
      'export const a = 1',
      '',
    ].join('\n'))).toBe(1)
  })

  it('binds the alias, not the original name', async () => {
    // `original` appearing in the body must not save `renamed`.
    expect(await lint([
      'import { original as renamed } from \'a\'',
      '',
      'export const a = \'original\'',
      '',
    ].join('\n'))).toBe(1)
  })

  it('reports across a wrapped multi-line import', async () => {
    expect(await lint([
      'import {',
      '  used,',
      '  unused,',
      '} from \'a\'',
      '',
      'export const a = used',
      '',
    ].join('\n'))).toBe(1)
  })

  it('does not count a mention in a comment as a use', async () => {
    expect(await lint([
      'import { onlyInComment } from \'a\'',
      '',
      '// onlyInComment is discussed here and used nowhere',
      'export const a = 1',
      '',
    ].join('\n'))).toBe(1)
  })
})

describe('no-unused-imports: leaves used ones alone', () => {
  it('accepts a value used once', async () => {
    expect(await lint([
      'import { readFileSync } from \'node:fs\'',
      '',
      'export const a = readFileSync(\'x\', \'utf8\')',
      '',
    ].join('\n'))).toBe(0)
  })

  it('accepts a type used only in a type position', async () => {
    expect(await lint([
      'import type { Stats } from \'node:fs\'',
      '',
      'export function f(s: Stats): number { return s.size }',
      '',
    ].join('\n'))).toBe(0)
  })

  it('accepts an inline `type` specifier that is used', async () => {
    expect(await lint([
      'import { type Used, value } from \'a\'',
      '',
      'export function f(u: Used): unknown { return [u, value] }',
      '',
    ].join('\n'))).toBe(0)
  })

  it('never reports a side-effect import, which binds nothing', async () => {
    expect(await lint([
      'import \'node:process\'',
      '',
      'export const a = 1',
      '',
    ].join('\n'))).toBe(0)
  })

  it('accepts a name used only inside a template literal', async () => {
    expect(await lint([
      'import { inTemplate } from \'a\'',
      '',
      'export const a = `value is ${inTemplate}`',
      '',
    ].join('\n'))).toBe(0)
  })

  it('leaves a re-export alone: it is not an import binding', async () => {
    expect(await lint([
      'export { reExported } from \'a\'',
      '',
      'export const a = 1',
      '',
    ].join('\n'))).toBe(0)
  })
})

describe('no-unused-imports: the false positives that made it dangerous', () => {
  it('does not treat a dynamic import() as an import statement', async () => {
    /*
     * The `import(…)` sits mid-file. Read as a statement, the scan runs on
     * looking for a `from` clause it will never find, blanks everything up to
     * the line limit out of the searchable body, and reports `log` - used six
     * lines down and three more times below - as unused.
     */
    const source = [
      'import { log } from \'a\'',
      '',
      'export async function warn(): Promise<void> {',
      '  await import(\'b\').then(({ other }) => {',
      '    other()',
      '  })',
      '',
      '  log.warn(\'still here\')',
      '}',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })

  it('does not treat import.meta as an import statement', async () => {
    expect(await lint([
      'import { used } from \'a\'',
      '',
      'export const dir = import.meta.dir',
      'export const a = used',
      '',
    ].join('\n'))).toBe(0)
  })

  it('sees `$` as a name, which \\b cannot', async () => {
    // `\b\$\b` does not match the `$` in `` $`echo hi` ``, so Bun's shell
    // import read as unused - on a line deleting it would break.
    expect(await lint([
      'import { $ } from \'bun\'',
      '',
      'export async function run(): Promise<void> {',
      '  await $`echo hi`',
      '}',
      '',
    ].join('\n'))).toBe(0)
  })

  it('still reports an unused $-prefixed name', async () => {
    expect(await lint([
      'import { $unused } from \'a\'',
      '',
      'export const a = 1',
      '',
    ].join('\n'))).toBe(1)
  })

  it('survives a statement it cannot parse, rather than throwing', async () => {
    // Anything that is not an identifier is dropped: these names are
    // interpolated into a RegExp, and a stray `(` used to throw and take the
    // rule down for the whole file.
    const source = [
      'import { used } from \'a\'',
      '',
      'export const fn = (x: number): number => x',
      'export const a = used',
      '',
    ].join('\n')

    expect(await lint(source)).toBe(0)
  })
})
