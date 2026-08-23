import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runFormat } from '../../../src/formatter'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-rule-sort-imports-'))
}

describe('pickier/sort-imports', () => {
  it('flags unsorted imports and formatter fixes them', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = [
      'import z, { B, E as D } from \'lib\'',
      'import type { C, G as F } from \'lib\'',
      'import { X } from \'./local\'',
      'import * as NS from \'./ns\'',
      'import \'side-effects\'',
      '',
      'const v = B + (NS ? 1 : 0) + X',
      'export { v }',
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
      pluginRules: { 'pickier/no-unused-imports': 'off', 'pickier/sort-imports': 'warn' },
    }, null, 2), 'utf8')

    const lintCode = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(lintCode).toBe(0)

    const fmtCode = await runFormat([dir], { write: true, config: cfgPath })
    expect(fmtCode).toBe(0)
    const got = readFileSync(join(dir, file), 'utf8')
    expect(/import type \{ C, (?:G as F|F as G) \} from 'lib'\n/.test(got)).toBe(true)
  })
})
