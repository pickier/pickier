import { expect, test } from 'bun:test'
import { defaultConfig } from '../../../src/config'
import { formatCode } from '../../../src/format'
import { shellSourceLines } from '../../../src/rules/shell/_shared'
import { indentRule } from '../../../src/rules/shell/indent'
import { operatorSpacingRule } from '../../../src/rules/shell/operator-spacing'

const context = { filePath: 'script.sh', config: defaultConfig } as never

function unchanged(source: string) {
  expect(indentRule.check(source, context)).toEqual([])
  expect(operatorSpacingRule.check(source, context)).toEqual([])
  expect(indentRule.fix!(source, context)).toBe(source)
  expect(operatorSpacingRule.fix!(source, context)).toBe(source)
  const formatted = formatCode(source, defaultConfig, 'script.sh')
  expect(formatted).toBe(source)
  expect(formatCode(formatted, defaultConfig, 'script.sh')).toBe(formatted)
}

test('embedded multiline JavaScript retains its indexing, indentation and literal whitespace', () => {
  unchanged([
    '#!/bin/bash', 'if true; then', "  result=$(bun -e 'const all = [1, 2]  ",
    'const generation = (id: string) => id.match(/item-(\\d+)/)?.[1]',
    '\tconst pick = all[0]  ', '', '', "console.log(pick)')", '  echo "$result"', 'fi', '',
  ].join('\n'))
})

test('nested substitutions keep outer double quotes and inner single quotes across lines', () => {
  unchanged([
    '#!/bin/bash', 'if true; then', '  result="$(printf \'%s\' "one',
    '  two  ', '', '', 'three")"', '  echo "$result"', 'fi', '',
  ].join('\n'))
})

test('quoted test headers finish their block after the closing quote', () => {
  unchanged(['if test "one', 'two" = value; then', '  echo yes', 'fi', ''].join('\n'))
})

test('comments and escaped quotes cannot open multiline string state', () => {
  unchanged(['echo \\" # a single quote: \'', 'if true; then', '  echo yes', 'fi', ''].join('\n'))
})

test('ANSI-C quoted bodies preserve escaped delimiters and blank lines', () => {
  unchanged(["if true; then", "  printf '%s' $'one\\'  ", 'two  ', '', '', "three'", 'fi', ''].join('\n'))
})

test('heredoc quotes and brackets are data, including blank lines and trailing whitespace', () => {
  unchanged(['if true; then', "  cat <<'DATA'", '  " [x]  ', '', '', 'DATA', '  echo done', 'fi', ''].join('\n'))
})

test('real shell bracket errors after a quoted body remain reported and fixed', () => {
  const source = ["printf '%s' 'one", "two'; [x]", ''].join('\n')
  expect(operatorSpacingRule.check(source, context).length).toBeGreaterThan(0)
  expect(operatorSpacingRule.fix!(source, context)).toBe(["printf '%s' 'one", "two'; [ x ]", ''].join('\n'))
})

test('the formatter preserves the executed shell value, including whitespace', () => {
  const source = ['#!/bin/bash', 'if true; then', "printf '%s' 'one  ", '\ttwo  ', '', '', "three'", 'fi', ''].join('\n')
  const formatted = formatCode(source, defaultConfig, 'script.sh')
  const execute = (script: string) => {
    const result = Bun.spawnSync(['bash', '-c', script])
    expect(result.exitCode).toBe(0)
    return result.stdout.toString()
  }
  expect(execute(formatted)).toBe(execute(source))
  expect(formatted).toStartWith("#!/bin/bash\nif true; then\n  printf '%s'")
  expect(formatCode(formatted, defaultConfig, 'script.sh')).toBe(formatted)
})

test('quoted heredoc-looking text cannot hide subsequent shell syntax', () => {
  const lines = shellSourceLines(["echo 'one", "cat <<EOF", "two'", 'if true; then', '  echo yes', 'fi'].join('\n'))
  expect(lines[3].masked).toBe('if true; then')
  expect(lines[3].heredoc).toBe(false)
})


test('continued pipelines inside command substitutions retain their continuation indent', () => {
  unchanged(['if true; then', '  result=$(printf value \\', '    | cat)', '  echo "$result"', 'fi', ''].join('\n'))
})
