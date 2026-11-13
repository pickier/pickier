import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../../src/config'
import { noSpaceInCodeRule } from '../../../src/rules/markdown/no-space-in-code'

const context = { filePath: 'wrapped.md', config: defaultConfig }

describe('MD038 code span boundaries', () => {
  it.each(['\n', '\r\n'])('preserves wrapped spans and adjacent spans with %j line endings', (newline) => {
    const text = [
      'A service answers a `LicenseGrant` (`{ project, licenseKey,',
      'dashboardUrl }`) from `provision` and leaves `authenticateReadKey` and `usage`',
      'off its adapter. `createHqService` mounts the routes.',
      '',
    ].join(newline)
    expect(noSpaceInCodeRule.check(text, context)).toEqual([])
    expect(noSpaceInCodeRule.fix!(text, context)).toBe(text)
  })

  it('reports real padding after a wrapped span at its original position', () => {
    const text = 'A `wrapped\nspan` and ` padded ` end.\n'
    const issues = noSpaceInCodeRule.check(text, context)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ line: 2, column: 11 })
    expect(noSpaceInCodeRule.fix!(text, context)).toBe('A `wrapped\nspan` and `padded` end.\n')
  })

  it('requires exactly matching backtick runs', () => {
    const text = 'Use `` first ` second `` here.\n'
    expect(noSpaceInCodeRule.check(text, context)).toHaveLength(1)
    expect(noSpaceInCodeRule.fix!(text, context)).toBe('Use ``first ` second`` here.\n')
  })

  it('does not open a code span at an escaped delimiter', () => {
    const text = 'Use \\` literal and ` padded ` here.\n'
    expect(noSpaceInCodeRule.check(text, context)).toHaveLength(1)
    expect(noSpaceInCodeRule.fix!(text, context)).toBe('Use \\` literal and `padded` here.\n')
  })

  it('keeps whitespace-only spans and required backtick padding', () => {
    const text = 'Use `   ` and `` `value` `` and `` ` `` here.\n'
    expect(noSpaceInCodeRule.check(text, context)).toEqual([])
    expect(noSpaceInCodeRule.fix!(text, context)).toBe(text)
  })

  it('does not pair delimiters across a paragraph or a code block', () => {
    const text = 'An unmatched ` opener\n\n` padded `\n\n~~~\n` ignored `\n~~~\n'
    expect(noSpaceInCodeRule.check(text, context)).toHaveLength(1)
    expect(noSpaceInCodeRule.fix!(text, context)).toBe('An unmatched ` opener\n\n`padded`\n\n~~~\n` ignored `\n~~~\n')
  })
})
