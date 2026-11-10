import type { PickierConfig } from '../../src/types'
import { describe, expect, it } from 'bun:test'
import { noUnusedImportsRule } from '../../src/rules/imports/no-unused-imports'

function check(source: string) {
  return noUnusedImportsRule.check(source, { filePath: 'subject.ts', config: {} as PickierConfig })
}

describe('no-unused-imports statement boundaries', () => {
  for (const source of [
    "import{readFileSync as read}from'node:fs';import path from'node:path';console.log(read(path.resolve('x')))\n",
    "import { readFileSync as read } from 'node:fs'; import path from 'node:path'; console.log(read(path.resolve('x')))\n",
    "import * as paths from 'node:path';console.log(paths.resolve('x'))\n",
    "import 'setup';import { used } from 'pkg';console.log(used)\n",
    "import {\n  used,\n} from 'pkg';console.log(used)\n",
    "import type { Value } from 'pkg';export const value:Value={}\n",
    "import/*from 'fake'*/{used/*, unused*/}from'pkg';console.log(used)\n",
    "import type from 'pkg';console.log(type)\n",
    "import from from 'pkg';console.log(from)\n",
    "import { type as value } from 'pkg';console.log(value)\n",
    "import { 'original' as local } from 'pkg';console.log(local)\n",
    "import value from 'pkg' with { type: 'json' };console.log(value)\n",
  ]) {
    it(`retains uses outside the import span: ${JSON.stringify(source)}`, () => {
      expect(check(source)).toEqual([])
    })
  }

  it('reports each unused binding at its own position on a shared line', () => {
    const source = "import unused from 'a';import{other as unusedToo}from'b';console.log('done')\n"
    expect(check(source).map(issue => ({ message: issue.message, line: issue.line, column: issue.column }))).toEqual([
      { message: "'unused' is imported but never used", line: 1, column: source.indexOf('unused') + 1 },
      { message: "'unusedToo' is imported but never used", line: 1, column: source.indexOf('unusedToo') + 1 },
    ])
  })

  it('reports a contextual keyword used as a default binding', () => {
    expect(check("import from from 'pkg';\n").map(issue => issue.message)).toEqual(["'from' is imported but never used"])
  })

  it('does not count another import clause as a use', () => {
    const issues = check("import { shared } from 'a';import { shared as alias } from 'b'\n")
    expect(issues.map(issue => issue.message)).toEqual([
      "'shared' is imported but never used",
      "'alias' is imported but never used",
    ])
  })

  it('does not parse import text in strings, comments or dynamic imports', () => {
    expect(check("const text=\"import { missing } from 'pkg';\";\n// import { commented } from 'pkg'\nimport('pkg').then(mod=>console.log(mod,text))\n")).toEqual([])
  })
})

describe('no-unused-imports lexical regions', () => {
  it('ignores import text inside nested templates', () => {
    const source = [
      "import { used } from 'pkg'",
      "const text = `${'}' + `import { fake } from 'other'`}`",
      'console.log(text, used)',
    ].join('\n')
    expect(check(source)).toEqual([])
  })

  it('retains a default value named type beside named bindings', () => {
    expect(check("import type,{unused}from'pkg';console.log(type)\n").map(issue => issue.message)).toEqual(["'unused' is imported but never used"])
  })

  it('reports supported bindings alongside an unsupported Unicode binding', () => {
    const source = "/* 🟢 */import { λ, unused } from 'pkg';\n"
    expect(check(source).map(issue => ({ message: issue.message, column: issue.column }))).toEqual([{ message: "'unused' is imported but never used", column: source.indexOf('unused') + 1 }])
  })

  it('leaves an unterminated module string unclassified', () => {
    expect(check("import missing from 'unfinished\n")).toEqual([])
  })

  it('does not count import attributes as a use of the default binding', () => {
    expect(check("import type from 'pkg' with { type: 'json' };\n").map(issue => issue.message)).toEqual(["'type' is imported but never used"])
  })
})
