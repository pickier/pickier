import type { PickierConfig } from '../../src/types'
import { describe, expect, it } from 'bun:test'
import { formatCode } from '../../src/format'

/**
 * Formatting a YAML document means round-tripping it through Bun.YAML's
 * parsed value, and a comment is not in that value. Formatting deps.yaml
 * deleted the two lines saying why the Zig release is pinned, and would empty
 * a workflow file of every comment in it, so a document that holds a comment
 * keeps its text; everything else is still normalized.
 */
const cfg: PickierConfig = {
  verbose: false,
  ignores: [],
  lint: { extensions: ['yaml'], reporter: 'stylish', cache: false, maxWarnings: -1 },
  format: {
    extensions: ['yaml'],
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

function fmt(src: string): string {
  return formatCode(src, cfg, 'deps.yaml')
}

describe('yaml formatting', () => {
  it('keeps a comment on its own line', () => {
    const src = [
      'dependencies:',
      '  bun.sh: ^1.4.2',
      '  # Builds the native lint engine. A tagged release, not a dev build.',
      '  ziglang.org: 0.16.0',
      '',
    ].join('\n')
    expect(fmt(src)).toBe(src)
  })

  it('keeps a comment after a value', () => {
    const src = 'key: value # why this value\n'
    expect(fmt(src)).toBe(src)
  })

  it('still trims and collapses around a comment', () => {
    const src = 'dependencies:\n  # why the pin\n  bun.sh: ^1.4.2   \n\n\n  ziglang.org: 0.16.0\n'
    expect(fmt(src)).toBe('dependencies:\n  # why the pin\n  bun.sh: ^1.4.2\n\n  ziglang.org: 0.16.0\n')
  })

  it('normalizes a document with no comment in it', () => {
    expect(fmt('dependencies:\n    bun.sh: ^1.4.2\n')).toBe('dependencies:\n  bun.sh: ^1.4.2\n')
  })
})
