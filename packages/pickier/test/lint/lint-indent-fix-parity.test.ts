import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint, runLintProgrammatic } from '../../src/linter'

// Regression tests for #1372: the indent check and the --fix rewrite must
// gate on the same predicate. Previously --fix rewrote template files the
// check never flagged (stx/html/htm/vue), skipped yaml files it did flag,
// and ignored rules.indent = 'off'. Each case asserts BOTH halves so
// "reported" and "rewritten by --fix" can never diverge again.

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-indent-parity-'))
}

// One line indented with 3 spaces — an odd stop the indent rule flags in code
const TEMPLATE_SRC = '<div>\n   <span>hi</span>\n</div>\n'
const YAML_SRC = 'root:\n   nested: 1\n'
const TS_SRC = 'export const x = {\n   a: 1,\n}\n'
const SHELL_SRC = '#!/bin/sh\nif true; then\n   echo hi\nfi\n'

async function reportedRuleIds(dir: string, ext?: string): Promise<string[]> {
  const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1, ...(ext ? { ext } : {}) })
  return res.issues.map(i => i.ruleId as string)
}

describe('indent check/--fix parity (#1372)', () => {
  it('templates (stx/html/htm/vue): not reported and not rewritten', async () => {
    for (const ext of ['stx', 'html', 'htm', 'vue']) {
      const dir = tmp()
      const file = join(dir, `a.${ext}`)
      writeFileSync(file, TEMPLATE_SRC, 'utf8')

      expect(await reportedRuleIds(dir, ext)).toEqual([])

      await runLint([dir], { fix: true, ext })
      expect(readFileSync(file, 'utf8')).toBe(TEMPLATE_SRC)
    }
  })

  it('yaml/yml: not reported and not rewritten (indentation is semantic)', async () => {
    for (const ext of ['yaml', 'yml']) {
      const dir = tmp()
      const file = join(dir, `a.${ext}`)
      writeFileSync(file, YAML_SRC, 'utf8')

      expect(await reportedRuleIds(dir)).not.toContain('indent')

      await runLint([dir], { fix: true })
      expect(readFileSync(file, 'utf8')).toBe(YAML_SRC)
    }
  })

  it('ts control: reported, rewritten, and clean afterwards', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    writeFileSync(file, TS_SRC, 'utf8')

    expect(await reportedRuleIds(dir)).toContain('indent')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe('export const x = {\n  a: 1,\n}\n')
    expect(await reportedRuleIds(dir)).not.toContain('indent')
  })

  it('rules.indent = "off": not reported and not rewritten', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    writeFileSync(file, TS_SRC, 'utf8')
    const cfgPath = join(tmp(), 'cfg.json')
    writeFileSync(cfgPath, JSON.stringify({ rules: { indent: 'off' } }), 'utf8')

    const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1, config: cfgPath })
    expect(res.issues.map(i => i.ruleId)).not.toContain('indent')

    await runLint([dir], { fix: true, config: cfgPath })
    expect(readFileSync(file, 'utf8')).toBe(TS_SRC)
  })

  it('disable-directive-suppressed indent lines survive --fix', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = '// eslint-disable-next-line indent\n   const _b = 1\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('indent')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('block-comment interiors: not reported and not rewritten', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = '/*\n   three-space note\n*/\nconst _b = 1\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('indent')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('template-literal content: not reported and not rewritten', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = 'export const q = `\nline one\n   three spaced content\nend`\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('indent')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('shell: built-in indent stays out of the way of shell/indent', async () => {
    const dir = tmp()
    const file = join(dir, 'a.sh')
    writeFileSync(file, SHELL_SRC, 'utf8')

    // The shell plugin owns shell indentation — the built-in rule must not
    // double-report the same line.
    const ids = await reportedRuleIds(dir)
    expect(ids).not.toContain('indent')
    expect(ids).toContain('shell/indent')

    // --fix still normalizes, via the shell plugin's own fixer — so the
    // rewrite is announced by the shell/indent diagnostic above.
    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe('#!/bin/sh\nif true; then\n  echo hi\nfi\n')
  })
})
