import { expect, test } from 'bun:test'
import { defaultConfig } from '../../../src/config'
import { formatCode } from '../../../src/format'
import { indentRule } from '../../../src/rules/shell/indent'
import { noVariableInSingleQuotesRule } from '../../../src/rules/shell/no-variable-in-single-quotes'

const context = { filePath: 'script.sh', config: defaultConfig } as never
const source = ['if first \\', '  && second \\', '  && third; then', '  echo yes', 'else', '  if fourth \\', '    && fifth; then', '    echo nested', '  fi', 'fi', ''].join('\n')

test('continued condition headers retain their block nesting in checking and fixing', () => {
  expect(indentRule.check(source, context)).toEqual([])
  expect(indentRule.fix!(source, context)).toBe(source)
  expect(formatCode(source, defaultConfig, 'script.sh')).toBe(source)
  expect(formatCode(formatCode(source, defaultConfig, 'script.sh'), defaultConfig, 'script.sh')).toBe(source)
})

test('continued commands do not open a block; quoted and commented backslashes do not continue', () => {
  const text = ['echo one \\', '  two', 'echo "\\\\"', 'echo three # \\', 'echo four', ''].join('\n')
  expect(indentRule.check(text, context)).toEqual([])
})

test('trap code defers variable expansion until the signal fires', () => {
  for (const prefix of ['trap ', 'trap -- ', 'builtin trap ', 'command trap ', 'true; trap '])
    expect(noVariableInSingleQuotesRule.check(`${prefix}'rm -rf "$work"' EXIT`, context)).toEqual([])
  expect(noVariableInSingleQuotesRule.check("echo '$work'", context)).toHaveLength(1)
})
