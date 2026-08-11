import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint, runLintProgrammatic } from '../../src/linter'

// Regression tests for #1372 (no-debugger half): the fixer used to delete any
// line matching /^\s*debugger\b/ in any file, while the scan gates on file
// type, comment lines, and disable directives. Each case asserts BOTH halves
// so "reported" and "deleted by --fix" can never diverge again.

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-debugger-parity-'))
}

async function reportedRuleIds(dir: string): Promise<string[]> {
  const res = await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1 })
  return res.issues.map(i => i.ruleId as string)
}

describe('no-debugger check/--fix parity (#1372)', () => {
  it('markdown code examples: not reported and not deleted', async () => {
    const dir = tmp()
    const file = join(dir, 'doc.md')
    const src = '# Doc\n\n```js\nfunction f() {\n  debugger\n  return 1\n}\n```\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('no-debugger')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('yaml keys named debugger: not reported and not deleted', async () => {
    const dir = tmp()
    const file = join(dir, 'cfg.yaml')
    const src = 'debugger: true\nother: 1\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('no-debugger')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('disable-directive-suppressed debugger lines survive --fix', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = '// eslint-disable-next-line no-debugger\ndebugger\nconst _a = 1\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('no-debugger')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('block-comment debugger text: not reported and not deleted', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = '/*\ndebugger\n*/\nconst _a = 1\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('no-debugger')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('template-literal debugger content: not reported and not deleted', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    const src = 'const _t = `\ndebugger\n`\n'
    writeFileSync(file, src, 'utf8')

    expect(await reportedRuleIds(dir)).not.toContain('no-debugger')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('real debugger statements: reported, removed, and clean afterwards', async () => {
    const dir = tmp()
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'debugger\nconst _a = 1\n', 'utf8')

    expect(await reportedRuleIds(dir)).toContain('no-debugger')

    await runLint([dir], { fix: true })
    expect(readFileSync(file, 'utf8')).toBe('const _a = 1\n')
    expect(await reportedRuleIds(dir)).not.toContain('no-debugger')
  })

  it('programmatic fix path uses the same gates', async () => {
    const dir = tmp()
    const protectedFile = join(dir, 'cfg.yaml')
    const codeFile = join(dir, 'a.ts')
    const yamlSrc = 'debugger: true\n'
    writeFileSync(protectedFile, yamlSrc, 'utf8')
    writeFileSync(codeFile, 'debugger\nconst _a = 1\n', 'utf8')

    await runLintProgrammatic([dir], { reporter: 'json', maxWarnings: -1, fix: true })
    expect(readFileSync(protectedFile, 'utf8')).toBe(yamlSrc)
    expect(readFileSync(codeFile, 'utf8')).toBe('const _a = 1\n')
  })
})
