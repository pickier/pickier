import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-rule-sort-named-imports-'))
}

describe('pickier/sort-named-imports', () => {
  it('flags unsorted named imports (alphabetical, asc)', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = [
      'import { useReducer, useRef, createContext, useEffect, useLayoutEffect, useId, useState } from \'react\'',
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
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'pickier/no-unused-imports': 'off', 'pickier/sort-named-imports': ['warn', { type: 'alphabetical', order: 'asc' }] },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('respects ignoreAlias by sorting on alias name', async () => {
    const dir = tmp()
    const file = 'b.ts'
    const src = [
      'import { B as AA, A as BB } from \'pkg\'',
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
      plugins: [{ name: 'pickier', rules: {} }],
      pluginRules: { 'pickier/no-unused-imports': 'off', 'pickier/sort-named-imports': ['warn', { ignoreAlias: true }] },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})
