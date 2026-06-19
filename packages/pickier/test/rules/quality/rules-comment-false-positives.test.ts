import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-comment-fp-'))
}

function makeConfig(dir: string): string {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off', quotes: 'warn' },
    plugins: [{ name: 'pickier', rules: {} }],
    pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off', 'node/prefer-global/process': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('comment false positives', () => {
  // A template literal whose `${ … }` interpolation contains a nested template,
  // a regex, and escaped quotes used to desync the comment-state scanner, so
  // every block comment below it was misread as code — and the `quotes` rule
  // fired on double-quoted phrases inside JSDoc.
  it('does not flag quotes inside a block comment after an interpolated template literal', async () => {
    const dir = tmp()
    const src = [
      'export function ssh(host: string, args: string[]): string {',
      // eslint-disable-next-line no-template-curly-in-string
      '  return `ssh ${args.map(a => `"${a.replace(/"/g, \'\\\\"\')}"`).join(\' \')} ${host}`',
      '}',
      '',
      '/**',
      ' * Host-key pinning is disabled; a stale entry would otherwise abort with',
      ' * "REMOTE HOST IDENTIFICATION HAS CHANGED".',
      ' */',
      'export const OPTS = [\'-o\', \'StrictHostKeyChecking=no\']',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  // A trailing line comment containing a comma + words must not be parsed as
  // additional declarators ('… a profile, not a region.' → `not` "unused").
  it('does not treat words in a trailing line comment as declared variables', async () => {
    const dir = tmp()
    const src = [
      'export function make() {',
      '  const ce = build() // global client; first ctor arg is a profile, not a region.',
      '  return ce',
      '}',
      'function build() { return 1 }',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'b.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
    expect(code).toBe(0)
  })

  // A `//` inside a string (e.g. a URL) must NOT be treated as a comment.
  it('does not strip a // that lives inside a string literal', async () => {
    const dir = tmp()
    const src = [
      'export function use() {',
      '  const url = \'http://example.com/a,b,c\'',
      '  return url',
      '}',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'c.ts'), src, 'utf8')
    const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
    expect(code).toBe(0)
  })
})
