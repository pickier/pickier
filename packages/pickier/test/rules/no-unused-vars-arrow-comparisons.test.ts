import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { noUnusedVarsRule } from '../../src/rules/general/no-unused-vars'

const context = { filePath: 'desktop-service.ts', options: {}, config: defaultConfig }

describe('no-unused-vars reads explicit arrow blocks before their comparisons', () => {
  for (const parameter of ['text', '(text)']) {
    it(`retains a used ${parameter} callback parameter after a less-than condition`, () => {
      const source = `export async function collect(run) {
  let output = ''
  const code = await run(['list', '--format', 'json'], ${parameter} => { if (output.length < 4000000) output += text })
  return { code, output }
}
`
      expect(noUnusedVarsRule.check(source, context)).toEqual([])
      expect(noUnusedVarsRule.fix!(source, context)).toBe(source)
    })
  }

  it('still reports an unused callback parameter when its block contains a comparison', () => {
    const source = `export function collect(run, output) {
  return run(unused => { if (output.length < 4000000) output += 'fixed' })
}
`
    const issues = noUnusedVarsRule.check(source, context)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("'unused'")
  })

  for (const parameter of ['text', '(text)']) {
    it(`ignores an earlier quoted arrow when finding the ${parameter} block`, () => {
      const source = `export function collect(run, output) {
  return run('text => {', ${parameter} => { if (output.length < 4000000) output += 'fixed' })
}
`
      const issues = noUnusedVarsRule.check(source, context)
      expect(issues).toHaveLength(1)
      expect(issues[0]?.message).toContain("'text'")
    })
  }
})
