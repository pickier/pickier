import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-lint-disable-trailing-'))
}

describe('disable directives with trailing -- comments', () => {
  it('eslint-disable-next-line with -- explanation suppresses rule', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = [
      '// eslint-disable-next-line no-console -- needed for debugging',
      'console.log(1)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const code = await runLint([dir], { reporter: 'json' })
    expect(code).toBe(0)
  })

  it('pickier-disable-next-line with -- explanation suppresses rule', async () => {
    const dir = tmp()
    const file = 'b.ts'
    const src = [
      '// pickier-disable-next-line no-console -- this is intentional logging',
      'console.log(1)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const code = await runLint([dir], { reporter: 'json' })
    expect(code).toBe(0)
  })

  it('disable-next-line with -- and plugin-prefixed rule suppresses', async () => {
    const dir = tmp()
    const file = 'c.ts'
    const src = [
      '// eslint-disable-next-line pickier/no-unused-vars -- false positive in regex',
      'const _patterns = [',
      '  /test/g,',
      ']',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'pickier/no-unused-vars': 'error' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('disable-next-line with comma-separated rules and -- comment', async () => {
    const dir = tmp()
    const file = 'd.ts'
    const src = [
      '// eslint-disable-next-line no-console, no-debugger -- both needed here',
      'console.log(1)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const code = await runLint([dir], { reporter: 'json' })
    expect(code).toBe(0)
  })

  it('block disable with -- comment suppresses rule', async () => {
    const dir = tmp()
    const file = 'e.ts'
    const src = [
      '/* eslint-disable no-console -- logging section */',
      'console.log(1)',
      'console.log(2)',
      '/* eslint-enable no-console */',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const code = await runLint([dir], { reporter: 'json' })
    expect(code).toBe(0)
  })

  it('inline disable with -- comment suppresses rule', async () => {
    const dir = tmp()
    const file = 'f.ts'
    const src = [
      '// eslint-disable no-console -- entire file needs console',
      'console.log(1)',
      'console.log(2)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const code = await runLint([dir], { reporter: 'json' })
    expect(code).toBe(0)
  })
})
