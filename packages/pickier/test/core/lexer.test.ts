/**
 * The shared lexer, and the rules that read source through it.
 *
 * A backtick or an apostrophe inside a comment is prose:
 *
 *     /** Uses the `bucket's` policy *\/
 *
 * but a scanner that does not know it is in a comment sees a template literal
 * open there, closed by the next backtick in real code, and reads everything
 * after it inside out. Each rule had its own scanner and each got a different
 * subset of the language wrong - regexes, nested templates, strings that end
 * at a line break - so the same report kept coming back in a new shape. These
 * cases pin the lexer itself and then the rules that used to carry their own.
 */

import type { RuleModule } from '../../src/types'
import { describe, expect, it } from 'bun:test'
import { lexSource, lineStartsInTemplate, maskComments, maskNonCode } from '../../src/lexer'
import { computeLineStartsInTemplate } from '../../src/rules/general/_template-tracking'
import { noUnusedVarsRule } from '../../src/rules/general/no-unused-vars'
import { preferConstRule } from '../../src/rules/general/prefer-const'
import { noUnusedImportsRule } from '../../src/rules/imports/no-unused-imports'
import { noUseBeforeDefineRule } from '../../src/rules/quality/no-use-before-define'
import { noTopLevelAwaitRule } from '../../src/rules/ts/no-top-level-await'

const T = '`'

function check(rule: RuleModule, source: string, filePath = '/project/subject.ts'): string[] {
  return rule.check(source, { filePath, config: {} as any, options: {} } as any).map(issue => `${issue.line}:${issue.column} ${issue.message}`)
}

/** A used parameter, a used local and an arrow parameter after `prefix`. */
function withUsesAfter(prefix: string): string {
  return [
    prefix,
    'export function policy(bucket: string, region: string): string {',
    '  const joined = `${bucket}:${region}`',
    '  return joined',
    '}',
    '',
    'export const lower = (value: string): string => value.toLowerCase()',
    '',
  ].join('\n')
}

/** Every shape the report and its variants take, as source that compiles. */
const SHAPES: Record<string, string> = {
  'an apostrophe in backticks in a JSDoc block': `/** Uses the ${T}bucket's${T} policy */`,
  'an apostrophe in backticks across a multi-line JSDoc': `/**\n * Reads the ${T}bucket's${T} grants.\n * @param grants the ${T}grantee's${T} list\n */`,
  'an apostrophe in backticks in a line comment': `// the ${T}caller's${T} name`,
  'an apostrophe in backticks in a plain block comment': `/* the ${T}owner's${T} name */`,
  'an unbalanced backtick in a line comment': `// an unbalanced ${T} backtick`,
  'an unbalanced backtick in a block comment': `/** an unbalanced ${T} backtick, and an apostrophe's tail */`,
  'a // inside a string': `export const url = 'https://example.com/it' + "s://a"`,
  'a /* inside a template literal': `export const glob = ${T}/* it's ${T}.length`,
  'a regex with quotes in a class': `export const quotes = /['"${T}]/g`,
  'a regex with an apostrophe after return': `export function hasApostrophe(text: string): boolean {\n  return /it's/.test(text)\n}`,
  'a regex with a backtick and an escaped slash': `export const tick = /${T}\\/\\//`,
  'a regex whose class holds a slash': `export const slash = /[/'"]+/`,
  'nested templates with comments in ${}': `export const nested = ${T}a\${${T}b\${/* it's ${T}x${T} */ 1}${T}}c${T}`,
  'a template ${} holding a line comment': `export const multi = ${T}a\${(\n  1 // the ${T}caller's${T} name\n)}b${T}`,
  'a generated-code template with escaped backticks': `export const generated = ${T}/** the \\${T}bucket's\\${T} policy */\\nexport const x = 1${T}`,
}

describe('lexSource', () => {
  it('finds a comment and blanks only its contents', () => {
    const source = `const a = 1 /** the ${T}bucket's${T} */ + 2`
    const masked = maskComments(source)

    expect(masked).toHaveLength(source.length)
    expect(masked).toBe(`const a = 1 /*${' '.repeat(source.indexOf('*/') - source.indexOf('/**') - 2)}*/ + 2`)
  })

  it('keeps line breaks, so a column in the masked text is the column in the source', () => {
    const source = `/**\n * the ${T}bucket's${T}\n */\nconst a = 'b'\n`
    const masked = maskNonCode(source)

    expect(masked.split('\n').map(line => line.length)).toEqual(source.split('\n').map(line => line.length))
  })

  it('does not treat comment markers in a string, template or regex as comments', () => {
    const source = `const a = 'http://x' + "/* y */" + ${T}// z${T} + /\\/\\//.source`
    const comments = lexSource(source).regions.filter(region => region.kind === 'comment')

    expect(comments).toHaveLength(0)
  })

  it('reads a slash after a value as division and after an operator as a pattern', () => {
    const regions = (source: string): string[] => lexSource(source).regions.map(region => `${region.kind}:${source.slice(region.start, region.end)}`)

    expect(regions('const half = total / 2 / count')).toEqual([])
    expect(regions('const re = /a\'b/g')).toEqual(['regex:a\'b'])
    expect(regions('if (ok) return /x"/.test(s)')).toEqual(['regex:x"'])
    expect(regions('const q = (a) / (b) + "\'"')).toEqual(['string:\''])
  })

  it('takes a slash that finds no closing slash on its line as division', () => {
    // `x = a\n/ b` - a pattern cannot span lines.
    const source = 'const ratio = (\n  1\n) + 2 / 3 // it\'s a ratio\nconst next = \'n\''
    const kinds = lexSource(source).regions.map(region => region.kind)

    expect(kinds).toEqual(['comment', 'string'])
  })

  it('ends a quoted string at an unescaped line break', () => {
    const source = 'const a = \'unterminated\nconst b = `tick`'
    const regions = lexSource(source).regions

    expect(regions.map(region => region.kind)).toEqual(['string', 'template'])
    expect(lexSource(source).templates).toEqual([[source.indexOf(T), source.lastIndexOf(T)]])
  })

  it('tracks templates nested inside ${} to any depth', () => {
    const source = `const s = ${T}a\${${T}b\${${T}c${T}}${T}}d${T} + 'e'`
    const { regions, templates } = lexSource(source)

    expect(templates).toEqual([[source.indexOf(T), source.lastIndexOf(T)]])
    expect(regions.filter(region => region.kind === 'string').map(region => source.slice(region.start, region.end))).toEqual(['e'])
  })

  for (const [name, shape] of Object.entries(SHAPES)) {
    it(`leaves no template open after ${name}`, () => {
      const source = withUsesAfter(shape)
      const starts = lineStartsInTemplate(source)
      const after = source.split('\n').length - 8

      // None of the trailing code lines begins inside a template body.
      expect(starts.slice(after)).toEqual(Array.from({ length: starts.length - after }, () => false))
    })
  }

  it('reports the lines a multi-line template body covers', () => {
    const source = `const script = ${T}\nlet a = 1\n\${value}\nlet b = 2\n${T}\nlet c = 3`

    expect(lineStartsInTemplate(source)).toEqual([false, true, true, true, true, false])
    expect(computeLineStartsInTemplate(source)).toEqual(lineStartsInTemplate(source))
  })

  it('keeps a hashbang out of the code', () => {
    const source = '#!/usr/bin/env bun\nconst a = \'it\\\'s\''

    expect(maskComments(source)).toBe(`#!${' '.repeat('/usr/bin/env bun'.length)}\nconst a = 'it\\'s'`)
  })
})

describe('no-unused-vars reads every shape as the compiler does', () => {
  for (const [name, shape] of Object.entries(SHAPES)) {
    it(`reports nothing after ${name}`, () => {
      // The shape's own declarations are exported, so only the uses below
      // it are under test.
      expect(check(noUnusedVarsRule, withUsesAfter(shape))).toEqual([])
    })
  }

  it('reports nothing for a JSDoc inside a function body', () => {
    const source = [
      'export function read(bucket: string, key: string): string {',
      `  /** The ${T}bucket's${T} object. */`,
      '  const path = `${bucket}/${key}`',
      '  return path',
      '}',
      '',
    ].join('\n')

    expect(check(noUnusedVarsRule, source)).toEqual([])
  })

  it('reports nothing for a JSDoc on a parameter', () => {
    const source = [
      'export function read(',
      `  /** the ${T}bucket's${T} name */`,
      '  bucket: string,',
      `  key: string, // the ${T}object's${T} key`,
      '): string {',
      '  return bucket + key',
      '}',
      '',
    ].join('\n')

    expect(check(noUnusedVarsRule, source)).toEqual([])
  })

  /**
   * The reported failure, end to end. The comment masker decided whether a
   * `/` opened a regex by looking at the character before it - which, on the
   * line after a comment, is the comment's last word. "backtick" is not a
   * keyword, so `/[`]/` read as division and its backtick opened a template.
   * That template "closed" at the first backtick of the later comment, the
   * apostrophe opened a string, and the comment was left unmasked: the
   * parameter scanner then read `the`, `s` and `name` as parameters.
   */
  it('reports nothing when a statement-starting regex follows a line comment', () => {
    const source = [
      'export function check(url: string): boolean {',
      '  // matches a backtick',
      `  /[${T}]/.test(url)`,
      '  return true',
      '}',
      '',
      'export function policy(',
      `  bucket: string, // the ${T}bucket's${T} name`,
      '  region: string,',
      '): string {',
      '  return bucket + region',
      '}',
      '',
    ].join('\n')

    expect(maskComments(source)).not.toContain('\'s')
    expect(check(noUnusedVarsRule, source)).toEqual([])
  })

  it('still reports a parameter that really is unused', () => {
    const source = withUsesAfter('').replace('policy(bucket: string, region: string)', 'policy(bucket: string, region: string, dropped: string)')
    const reported = check(noUnusedVarsRule, `/** Uses the ${T}bucket's${T} policy */\n${source}`)

    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('\'dropped\'')
  })

  /**
   * The fixer used to find templates one line at a time, so a backtick in a
   * comment earlier on the line made it think the parameter was template
   * text and leave the reported name alone.
   */
  it('renames a parameter that follows a backtick in a comment on its line', () => {
    const source = `export const run = /* the ${T}caller's${T} */ (cmd: string, unused: string): string => cmd\n`
    const fixed = noUnusedVarsRule.fix!(source, { filePath: '/project/subject.ts', config: {} as any, options: {} } as any)

    expect(fixed).toBe(source.replace('unused: string', '_unused: string'))
  })

  it('does not rename inside a template literal on the same line', () => {
    const source = 'export const run = (cmd: string, unused: string): string => `fn(x, unused) ${cmd}`\n'

    expect(check(noUnusedVarsRule, source)).toEqual([])
  })
})

describe('the other rules that used their own scanner', () => {
  it('no-top-level-await is not misled by a regex holding /* and a comment holding a backtick', () => {
    const source = [
      'const base = pattern.replace(/\\/?\\*\\*\\/*\\*\\*$/, \'\')',
      '',
      'export async function load(): Promise<void> {',
      `  /** Uses the ${T}bucket's${T} policy */`,
      '  await fetch(base)',
      '}',
      '',
    ].join('\n')

    expect(check(noTopLevelAwaitRule, source)).toEqual([])
  })

  it('no-top-level-await still reports a real one after the same shapes', () => {
    const source = `/** the ${T}bucket's${T} */\nconst re = /['"]/\nawait load()\n`

    expect(check(noTopLevelAwaitRule, source)).toEqual(['3:1 Do not use top-level await'])
  })

  /**
   * The template tracker read `return /it's/` as division, so the apostrophe
   * opened a string; the next quote closed it and the lone backtick in the
   * string after that opened a template that never closed. Every line below
   * was "inside a template", and skipped.
   */
  it('prefer-const still sees declarations after a regex with an apostrophe', () => {
    const source = [
      'export function hasApostrophe(text: string): boolean {',
      '  return /it\'s/.test(text)',
      '}',
      `export const note = "a ' and a ${T}"`,
      'let total = 1',
      'export const doubled = total * 2',
      'const label = \'x\'',
      '',
    ].join('\n')

    expect(check(preferConstRule, source)).toHaveLength(1)
  })

  it('no-unused-imports counts a use after an apostrophe in backticks', () => {
    const source = [
      'import { join } from \'node:path\'',
      '',
      `/** Joins the ${T}bucket's${T} key. */`,
      'export const key = (a: string): string => join(a, \'k\')',
      '',
    ].join('\n')

    expect(check(noUnusedImportsRule, source)).toEqual([])
  })

  it('no-use-before-define does not count a word in a comment or string as a use', () => {
    const source = [
      `// the ${T}caller's${T} name`,
      'export const label = \'name\'',
      'const name = 1',
      'export const doubled = name * 2',
      '',
    ].join('\n')

    expect(check(noUseBeforeDefineRule, source)).toEqual([])
  })
})
