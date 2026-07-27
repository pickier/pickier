import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { runLint } from '../../../src/linter'

/**
 * A template literal in a source file is often a program for something else:
 * a shell script sent over SSH, an injected `<script>` blob, a snippet piped
 * to another runtime. No fixer may rewrite what is inside one — the result is
 * not tidier code, it is a different language's source edited behind the
 * author's back, failing at runtime somewhere nobody is looking.
 */
function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-template-fix-'))
}

function makeConfig(dir: string, pluginRules: Record<string, string>): string {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules,
  }, null, 2), 'utf8')
  return cfgPath
}

async function fixture(source: string, pluginRules: Record<string, string>): Promise<string> {
  const dir = tmp()
  const file = join(dir, 'sample.ts')
  writeFileSync(file, source, 'utf8')

  await runLint([file], { fix: true, config: makeConfig(dir, pluginRules), reporter: 'json' } as any)

  return readFileSync(file, 'utf8')
}

describe('fixers leave template-literal bodies alone', () => {
  it('does not const-ify a let inside an embedded script', async () => {
    // This exact shape — a `let` assigned inside a try, in a snippet piped to
    // another runtime — was rewritten to `const`, which Bun refuses to parse.
    const source = [
      'export const script = `',
      '  bun -e \'',
      '    let cur = {}; try { cur = JSON.parse(readFile(f)) } catch {}',
      '    write(cur)',
      '  \'',
      '`',
      '',
    ].join('\n')

    const fixed = await fixture(source, { 'pickier/prefer-const': 'error' })

    expect(fixed).toContain('let cur = {}')
  })

  it('still sorts class lists inside a template', async () => {
    // The guard is not a blanket ban: markup in a TS file lives inside
    // template literals, and a rule that reorders a class list is doing what
    // the author wants there. Such rules opt out with
    // `meta.editsStringContent`.
    const source = 'export const view = `\n  <div class="text-white flex p-4 items-center">x</div>\n`\n'

    const fixed = await fixture(source, { 'pickier/sort-tailwind-classes': 'error' })

    expect(fixed).toContain('class="flex items-center p-4 text-white"')
  })

  it('still fixes the same construct outside a template', async () => {
    // The guard must not turn the fixers off for real code.
    const source = 'let untouched = 1\nexport const value = untouched\n'

    const fixed = await fixture(source, { 'pickier/prefer-const': 'error' })

    expect(fixed).toContain('const untouched = 1')
  })
})
