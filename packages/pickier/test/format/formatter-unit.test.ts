import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PickierConfig } from '../../src/types'
import { applyFixes, applyPluginFixes, formatStylish, formatVerbose } from '../../src/formatter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-formatter-unit-'))
}

const baseCfg: PickierConfig = {
  verbose: false,
  ignores: [],
  lint: { extensions: ['ts'], reporter: 'stylish', cache: false, maxWarnings: -1 },
  format: {
    extensions: ['ts'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one',
    indent: 2,
    indentStyle: 'spaces',
    quotes: 'single',
    semi: false,
  },
  rules: { noDebugger: 'error', noConsole: 'warn' },
  pluginRules: {},
}

// ─── applyPluginFixes ────────────────────────────────────────────────────────

describe('applyPluginFixes', () => {
  it('returns content unchanged when no rules enabled', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const src = 'const x = "hello"\n'
    const result = applyPluginFixes(file, src, { ...baseCfg, pluginRules: {} })
    expect(typeof result).toBe('string')
  })

  it('applies enabled plugin fixes', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const src = 'debugger\nconst x = 1\n'
    const cfg = { ...baseCfg, pluginRules: { 'pickier/prefer-const': 'off' } as any }
    const result = applyPluginFixes(file, src, cfg)
    expect(typeof result).toBe('string')
  })

  it('skips rules marked as off', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const src = 'const x = "hello"\n'
    const cfg = { ...baseCfg, pluginRules: { 'style/quotes': 'off' } as any }
    const result = applyPluginFixes(file, src, cfg)
    expect(result).toBe(src)
  })
})

// ─── applyFixes ──────────────────────────────────────────────────────────────

describe('applyFixes', () => {
  it('removes debugger statements when noDebugger is enabled', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const src = 'debugger\nconst x = 1\n'
    const result = applyFixes(file, src, baseCfg)
    expect(result).not.toContain('debugger')
  })

  it('preserves debugger when noDebugger is off', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const src = 'debugger\nconst x = 1\n'
    const cfg = { ...baseCfg, rules: { noDebugger: 'off' as const, noConsole: 'warn' as const } }
    const result = applyFixes(file, src, cfg)
    expect(result).toContain('debugger')
  })

  it('applies format code pass', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const src = 'const x = "hello"\n'
    const result = applyFixes(file, src, baseCfg)
    expect(result).toContain("'hello'")
  })

  it('handles empty content', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    const result = applyFixes(file, '', baseCfg)
    expect(result).toBe('')
  })
})

// ─── formatVerbose ───────────────────────────────────────────────────────────

describe('formatVerbose', () => {
  it('returns empty string for no issues', () => {
    const result = formatVerbose([])
    expect(result).toBe('')
  })

  it('formats issues with file context', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, 'const x = 1\nconsole.log(x)\n', 'utf8')
    const issues = [{
      filePath: file,
      line: 2,
      column: 1,
      ruleId: 'no-console',
      message: 'Unexpected console call',
      severity: 'warning' as const,
    }]
    const result = formatVerbose(issues)
    expect(result).toContain('no-console')
    expect(result).toContain('Unexpected console call')
  })

  it('handles missing file gracefully', () => {
    const issues = [{
      filePath: '/nonexistent/file.ts',
      line: 1,
      column: 1,
      ruleId: 'some-rule',
      message: 'Some message',
      severity: 'error' as const,
    }]
    const result = formatVerbose(issues)
    expect(result).toContain('some-rule')
    expect(result).toContain('Some message')
  })

  it('includes help text when present', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, 'const x = 1\n', 'utf8')
    const issues = [{
      filePath: file,
      line: 1,
      column: 1,
      ruleId: 'some-rule',
      message: 'Some message',
      severity: 'error' as const,
      help: 'Fix it this way',
    }]
    const result = formatVerbose(issues)
    expect(result).toContain('Fix it this way')
  })

  it('formats multiple issues in same file', () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, 'const x = 1\nconst y = 2\nconst z = 3\n', 'utf8')
    const issues = [
      { filePath: file, line: 1, column: 1, ruleId: 'rule-a', message: 'Message A', severity: 'error' as const },
      { filePath: file, line: 3, column: 1, ruleId: 'rule-b', message: 'Message B', severity: 'warning' as const },
    ]
    const result = formatVerbose(issues)
    expect(result).toContain('rule-a')
    expect(result).toContain('rule-b')
  })
})

// ─── formatStylish ───────────────────────────────────────────────────────────

describe('formatStylish', () => {
  it('returns empty string for no issues', () => {
    const result = formatStylish([])
    expect(result).toBe('')
  })

  it('formats issues in stylish format', () => {
    const issues = [{
      filePath: '/path/to/file.ts',
      line: 5,
      column: 10,
      ruleId: 'no-console',
      message: 'Unexpected console call',
      severity: 'warning' as const,
    }]
    const result = formatStylish(issues)
    expect(result).toContain('no-console')
    expect(result).toContain('Unexpected console call')
    expect(result).toContain('5:10')
  })

  it('formats error severity differently from warning', () => {
    const issues = [
      { filePath: '/f.ts', line: 1, column: 1, ruleId: 'rule-a', message: 'Error msg', severity: 'error' as const },
      { filePath: '/f.ts', line: 2, column: 1, ruleId: 'rule-b', message: 'Warn msg', severity: 'warning' as const },
    ]
    const result = formatStylish(issues)
    expect(result).toContain('rule-a')
    expect(result).toContain('rule-b')
  })

  it('groups issues by file', () => {
    const issues = [
      { filePath: '/file-a.ts', line: 1, column: 1, ruleId: 'rule-a', message: 'Msg A', severity: 'error' as const },
      { filePath: '/file-b.ts', line: 1, column: 1, ruleId: 'rule-b', message: 'Msg B', severity: 'error' as const },
    ]
    const result = formatStylish(issues)
    expect(result).toContain('file-a.ts')
    expect(result).toContain('file-b.ts')
  })
})
