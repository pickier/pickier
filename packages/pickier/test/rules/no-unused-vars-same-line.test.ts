import { expect, test } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { noUnusedVarsRule } from '../../src/rules/general/no-unused-vars'
const context = { filePath: 'canvas.ts', options: {}, config: defaultConfig }

test('later declarators and statements on the declaration line count as uses', () => {
  for (const source of [
    'const bounds = canvas.getBoundingClientRect(), x = event.clientX - bounds.left\nconsume(x)',
    'const bounds = canvas.getBoundingClientRect(); consume(bounds)',
    'const bounds: DOMRect = canvas.getBoundingClientRect(), x = bounds.left\nconsume(x)',
    'const { left } = canvas.getBoundingClientRect(), x = event.clientX - left\nconsume(x)',
  ]) expect(noUnusedVarsRule.check(source, context)).toEqual([])
})
test('same-line literal contents and unrelated property names are not uses', () => {
  for (const source of [
    "const bounds = 1, label = 'bounds'\nconsume(label)",
    'const bounds = 1, value = item.bounds\nconsume(value)',
    'const bounds = 1, value = { bounds: 2 }\nconsume(value)',
  ]) expect(noUnusedVarsRule.check(source, context).map(issue => issue.message)).toEqual([expect.stringContaining("'bounds'")])
})
