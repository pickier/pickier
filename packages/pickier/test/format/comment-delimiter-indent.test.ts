import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { formatCode } from '../../src/format'

function stable(source: string): void {
  const formatted = formatCode(source, defaultConfig, 'example.ts')
  expect(formatted).toBe(source)
  expect(formatCode(formatted, defaultConfig, 'example.ts')).toBe(formatted)
}

describe('comment delimiters and code indentation', () => {
  for (const delimiter of ['{', '[', '(']) {
    it(`does not open a code block for a line comment ending in ${delimiter}`, () => {
      stable([
        'function example() {',
        `  // Example ${delimiter}`,
        '  return 1',
        '}',
        'const after = 2',
        '',
      ].join('\n'))
    })

    it(`does not open a code block for block comment prose ending in ${delimiter}`, () => {
      stable([
        'function example() {',
        `  /* Example ${delimiter}`,
        '   * Documentation only.',
        '   */',
        '  return 1',
        '}',
        'const after = 2',
        '',
      ].join('\n'))
    })
  }

  it('retains a pending control body across a comment with a delimiter', () => {
    stable([
      'function example(value: boolean) {',
      '  if (value)',
      '    // Example (',
      '    return 1',
      '  return 0',
      '}',
      '',
    ].join('\n'))
  })

  it('retains a pending arrow body across a comment with a delimiter', () => {
    stable([
      'const example = value =>',
      '  // Example {',
      '  value + 1',
      'const after = 2',
      '',
    ].join('\n'))
  })
})

describe('real code around comment delimiters', () => {
  it('tracks class generator method blocks', () => {
    stable([
      'class Example {',
      '  *values() {',
      '    yield 1',
      '  }',
      '  after() {',
      '    return 2',
      '  }',
      '}',
      '',
    ].join('\n'))
  })

  it('tracks object generator method blocks', () => {
    stable([
      'const example = {',
      '  *values() {',
      '    yield 1',
      '  },',
      '  after() {',
      '    return 2',
      '  },',
      '}',
      '',
    ].join('\n'))
  })

  it('tracks real code after a closed leading block comment', () => {
    stable([
      '/* docs */ function example(ready: boolean) {',
      '  /* docs */ if (ready) {',
      '    return 1',
      '  }',
      '  return 0',
      '}',
      'const after = 2',
      '',
    ].join('\n'))
  })

  it('tracks a closing delimiter after a leading block comment', () => {
    stable([
      'function example() {',
      '  return 1',
      '/* docs */ }',
      'const after = 2',
      '',
    ].join('\n'))
  })

  it('ignores trailing comment delimiters and counts the preceding real opener', () => {
    stable([
      'function example(ready: boolean) { // Example (',
      '  const value = 1 // Example {',
      '  if (ready) { /* docs */',
      '    return value',
      '  }',
      '  return 0',
      '}',
      'const after = 2',
      '',
    ].join('\n'))
  })
})

it('retains a control body after a closed leading block comment', () => {
  stable([
    'function example(ready: boolean) {',
    '  /* docs */ if (ready)',
    '    return 1',
    '  return 0',
    '}',
    '',
  ].join('\n'))
})

it('treats comments between control keywords as token separators', () => {
  stable([
    'function example(first: boolean, second: boolean) {',
    '  if (first)',
    '    return 1',
    '  else/* docs */if (second)',
    '    return 2',
    '  return 0',
    '}',
    '',
  ].join('\n'))
})
