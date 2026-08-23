import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-new-rules-'))
}

function createConfig(ruleName: string) {
  return {
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { 'pickier/no-unused-imports': 'off', [ruleName]: 'error', 'no-unused-vars': 'off', 'quotes': 'off' },
  }
}

describe('New ESLint Rules', () => {
  it('constructor-super: flags missing super() call', async () => {
    const dir = tmp()
    const src = 'class B extends A {\n  constructor() {\n    console.log("no super")\n  }\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/constructor-super'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('getter-return: flags getter without return', async () => {
    const dir = tmp()
    const src = 'class C {\n  get value() {\n    console.log("no return")\n  }\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/getter-return'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-dupe-class-members: flags duplicate class members', async () => {
    const dir = tmp()
    const src = 'class C {\n  foo() {}\n  foo() {}\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-dupe-class-members'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-unsafe-negation: flags !x in obj', async () => {
    const dir = tmp()
    const src = 'if (!key in obj) { }\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-unsafe-negation'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('for-direction: flags wrong loop direction', async () => {
    const dir = tmp()
    const src = 'for (let i = 0; i < 10; i--) { }\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/for-direction'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-compare-neg-zero: flags comparison with -0', async () => {
    const dir = tmp()
    const src = 'if (x === -0) { }\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-compare-neg-zero'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-async-promise-executor: flags async Promise executor', async () => {
    const dir = tmp()
    const src = 'new Promise(async (resolve) => { })\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-async-promise-executor'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-await-in-loop: flags await in loop', async () => {
    const dir = tmp()
    const src = 'for (const x of arr) {\n  await fetch(x)\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-await-in-loop'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('require-await: flags async without await', async () => {
    const dir = tmp()
    const src = 'async function foo() {\n  return 42\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/require-await'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('default-case: flags switch without default', async () => {
    const dir = tmp()
    const src = 'switch (x) {\n  case 1: break\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/default-case'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-case-declarations: flags lexical declaration in case', async () => {
    const dir = tmp()
    const src = 'switch (x) {\n  case 1:\n    const y = 1\n    break\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-case-declarations'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-caller: flags arguments.callee', async () => {
    const dir = tmp()
    const src = 'function foo() {\n  return arguments.callee\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-caller'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-global-assign: flags assignment to Array', async () => {
    const dir = tmp()
    const src = 'Array = []\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-global-assign'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-octal: flags octal literal', async () => {
    const dir = tmp()
    const src = 'const x = 071\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-octal'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('no-useless-call: flags fn.call(undefined)', async () => {
    const dir = tmp()
    const src = 'fn.call(undefined, arg)\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/no-useless-call'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('complexity: passes for simple function', async () => {
    const dir = tmp()
    const src = 'function foo() {\n  return 42\n}\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('eslint/complexity'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(0)
  })

  it('import-first: flags import after statement', async () => {
    const dir = tmp()
    const src = 'const x = 1\nimport { foo } from "./foo"\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('pickier/import-first'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(1)
  })

  it('import-first: passes for imports at top', async () => {
    const dir = tmp()
    const src = 'import { foo } from "./foo"\nconst x = 1\n'
    writeFileSync(join(dir, 'a.ts'), src, 'utf8')
    writeFileSync(join(dir, 'foo.ts'), 'export const foo = 1', 'utf8')
    writeFileSync(join(dir, 'pickier.config.json'), JSON.stringify(createConfig('pickier/import-first'), null, 2), 'utf8')
    const code = await runLint([dir], { config: join(dir, 'pickier.config.json'), reporter: 'json' })
    expect(code).toBe(0)
  })
})
