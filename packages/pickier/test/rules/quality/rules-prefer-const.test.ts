import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-rule-prefer-const-'))
}

describe('pickier/prefer-const', () => {
  it('flags let that is never reassigned (suggest const)', async () => {
    const dir = tmp()
    const file = 'a.ts'
    const src = [
      'let x = 1',
      'console.log(x)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'prefer-const': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('passes when using const', async () => {
    const dir = tmp()
    const file = 'b.ts'
    const src = [
      'const x = 1',
      'console.log(x)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'prefer-const': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not flag when variable is reassigned later', async () => {
    const dir = tmp()
    const file = 'c.ts'
    const src = [
      'let x = 1',
      'x = 2',
      'console.log(x)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'prefer-const': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('ignores destructuring declarations', async () => {
    const dir = tmp()
    const file = 'd.ts'
    const src = [
      'const obj = { a: 1, b: 2 }',
      'let { a, b } = obj',
      'console.log(a, b)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'prefer-const': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('does not flag when using ++/-- or compound assignments', async () => {
    const dir = tmp()
    const file = 'e.ts'
    const src = [
      'let a = 1',
      'a++',
      'let b = 1',
      'b += 2',
      'console.log(a + b)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'prefer-const': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('ignores declarations without initializer on same line', async () => {
    const dir = tmp()
    const file = 'f.ts'
    const src = [
      'let x',
      'x = 1',
      'console.log(x)',
      '',
    ].join('\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'prefer-const': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  it('handles multiple declarators; flags the ones never reassigned', async () => {
    const dir = tmp()
    const file = 'g.ts'
    const src = [
      'let a = 1, b = 2',
      'console.log(b)',
      '',
    ].join('\\n')
    writeFileSync(join(dir, file), src, 'utf8')

    const cfgPath = join(dir, 'pickier.config.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      ignores: [],
      lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
      rules: { noDebugger: 'off', noConsole: 'off' },
      pluginRules: { 'prefer-const': 'warn', 'pickier/no-unused-vars': 'off' },
    }, null, 2), 'utf8')

    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })

  describe('fix', () => {
    function setupFix(src: string): { dir: string, file: string, cfg: string } {
      const dir = tmp()
      const file = 'a.ts'
      writeFileSync(join(dir, file), src, 'utf8')
      const cfg = join(dir, 'pickier.config.json')
      writeFileSync(cfg, JSON.stringify({
        verbose: false,
        ignores: [],
        lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
        format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
        rules: { noDebugger: 'off', noConsole: 'off' },
        pluginRules: { 'prefer-const': 'error', 'pickier/no-unused-vars': 'off' },
      }, null, 2), 'utf8')
      return { dir, file, cfg }
    }

    it('rewrites let to const for never-reassigned variable', async () => {
      const src = 'let x = 1\nconsole.log(x)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe('const x = 1\nconsole.log(x)\n')
    })

    it('does not rewrite var (only let → const)', async () => {
      // `var` is left alone by the auto-fix because in real-world TS
      // codebases it most commonly appears inside template literals that
      // emit JavaScript at runtime (where rewriting would change the
      // emitted code). Real TS uses `let`/`const`; users who want `var`
      // → `const` can convert manually.
      const src = 'var x = 1\nconsole.log(x)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('preserves indentation when rewriting', async () => {
      const src = 'function f() {\n  let x = 1\n  return x\n}\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe('function f() {\n  const x = 1\n  return x\n}\n')
    })

    it('does not rewrite when variable is reassigned', async () => {
      const src = 'let x = 1\nx = 2\nconsole.log(x)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('does not rewrite when variable is incremented', async () => {
      const src = 'let x = 1\nx++\nconsole.log(x)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('does not rewrite destructuring patterns', async () => {
      const src = 'let { a, b } = obj\nconsole.log(a, b)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('does not rewrite when one variable in a multi-decl is reassigned', async () => {
      const src = 'let x = 1, y = 2\ny = 3\nconsole.log(x, y)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('rewrites multi-decl when all variables are never reassigned', async () => {
      const src = 'let x = 1, y = 2\nconsole.log(x, y)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe('const x = 1, y = 2\nconsole.log(x, y)\n')
    })

    it('does not rewrite let without initializer', async () => {
      const src = 'let x\nx = 1\nconsole.log(x)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    // Regression for https://github.com/pickier/pickier/issues/1357
    it('does not rewrite when reassigned via array destructuring', async () => {
      const src = 'let cursor = 0\nlet value = null\n;[cursor, value] = readNumber()\nconsole.log(cursor, value)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('does not rewrite when reassigned via object destructuring (shorthand)', async () => {
      const src = 'let x = 1\nlet y = 2\n;({ x, y } = obj())\nconsole.log(x, y)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('does not rewrite when reassigned via object destructuring (key:binding)', async () => {
      const src = 'let z = 0\n;({ key: z } = source())\nconsole.log(z)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('still rewrites when name appears as object KEY only (not a binding)', async () => {
      // `{ x: alias } = obj` reassigns `alias`, not `x`. Our `let x` is
      // independent and should still be eligible for the const rewrite.
      const src = 'let x = 1\nlet alias = 0\n;({ x: alias } = obj())\nconsole.log(x, alias)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe('const x = 1\nlet alias = 0\n;({ x: alias } = obj())\nconsole.log(x, alias)\n')
    })

    it('respects // eslint-disable-next-line prefer-const', async () => {
      const src = '// eslint-disable-next-line prefer-const\nlet suppressed = 1\nconsole.log(suppressed)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('respects // pickier-disable-next-line prefer-const', async () => {
      const src = '// pickier-disable-next-line prefer-const\nlet suppressed = 1\nconsole.log(suppressed)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })

    it('respects bare disable-next-line (no rule list = disable all)', async () => {
      const src = '// eslint-disable-next-line\nlet suppressed = 1\nconsole.log(suppressed)\n'
      const { dir, file, cfg } = setupFix(src)
      await runLint([dir], { config: cfg, fix: true })
      expect(readFileSync(join(dir, file), 'utf8')).toBe(src)
    })
  })
})
