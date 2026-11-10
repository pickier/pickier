import { describe, expect, it } from 'bun:test'
import { tokenize } from '../../src/ast'

describe('tokenize import declaration regions', () => {
  it('keeps a nested template opaque and retains the following import', () => {
    const template = "`${'}' + `import { fake } from 'pkg'`}`"
    const source = `const text = ${template}; import live from 'pkg'; live;`
    const tokens = tokenize(source)
    const templates = tokens.filter(token => token.type === 'Template')
    expect(templates).toHaveLength(1)
    expect(templates[0]).toEqual({ type: 'Template', value: template, start: source.indexOf(template), end: source.indexOf(template) + template.length })
    expect(tokens.filter(token => token.type === 'Word' && token.value === 'import')).toHaveLength(1)
  })

  it('keeps slashes and backticks inside a regex character class', () => {
    const pattern = '/[/`]/g'
    const source = `const re = ${pattern}; import live from 'pkg'; live;`
    const tokens = tokenize(source)
    expect(tokens.filter(token => token.type === 'Regex')).toEqual([{ type: 'Regex', value: pattern, start: source.indexOf(pattern), end: source.indexOf(pattern) + pattern.length }])
    expect(tokens.filter(token => token.type === 'Word' && token.value === 'import')).toHaveLength(1)
  })
})
