import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-publint-'))
}

function writeConfig(dir: string, pluginRules: Record<string, any>): string {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['json'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['json'], trimTrailingWhitespace: false, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules,
  }, null, 2), 'utf8')
  return cfgPath
}

// All publint rules — disabled by default in tests so only the one under test fires
const ALL_PUBLINT_RULES: Record<string, string> = {
  'publint/exports-types-should-be-first': 'off',
  'publint/exports-default-should-be-last': 'off',
  'publint/exports-module-should-precede-require': 'off',
  'publint/exports-value-invalid': 'off',
  'publint/imports-key-invalid': 'off',
  'publint/imports-value-invalid': 'off',
  'publint/imports-default-should-be-last': 'off',
  'publint/imports-module-should-precede-require': 'off',
  'publint/use-type': 'off',
  'publint/deprecated-field-jsnext': 'off',
  'publint/field-invalid-value-type': 'off',
  'publint/local-dependency': 'off',
  'publint/has-module-but-no-exports': 'off',
  'publint/exports-missing-root-entrypoint': 'off',
  'publint/exports-fallback-array-use': 'off',
  'publint/file-does-not-exist': 'off',
  'publint/file-invalid-format': 'off',
  'publint/module-should-be-esm': 'off',
  'publint/bin-file-not-executable': 'off',
  'publint/exports-module-should-be-esm': 'off',
}

function enableRule(rule: string, severity: string = 'error'): Record<string, any> {
  return { ...ALL_PUBLINT_RULES, [rule]: severity }
}

describe('publint/use-type', () => {
  it('warns when "type" field is missing', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/use-type', 'error'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when "type" field exists', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/use-type', 'error'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/local-dependency', () => {
  it('flags file: dependencies', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        'my-local-lib': 'file:../my-local-lib',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/local-dependency'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('flags link: dependencies', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        'my-linked-lib': 'link:../my-linked-lib',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/local-dependency'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes with normal semver dependencies', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        'lodash': '^4.17.21',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/local-dependency'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/deprecated-field-jsnext', () => {
  it('flags jsnext:main field', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      'name': 'test-pkg',
      'version': '1.0.0',
      'type': 'module',
      'jsnext:main': './dist/index.js',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/deprecated-field-jsnext'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes without jsnext fields', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      module: './dist/index.mjs',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/deprecated-field-jsnext'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/has-module-but-no-exports', () => {
  it('warns when module exists without exports', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      module: './dist/index.mjs',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/has-module-but-no-exports'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when both module and exports exist', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      module: './dist/index.mjs',
      exports: { '.': './dist/index.mjs' },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/has-module-but-no-exports'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/field-invalid-value-type', () => {
  it('flags main field with wrong type', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      main: 123,
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/field-invalid-value-type'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes with correct field types', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      main: './dist/index.js',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/field-invalid-value-type'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/exports-types-should-be-first', () => {
  it('flags types not being first', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': {
          import: './dist/index.mjs',
          types: './dist/index.d.ts',
          default: './dist/index.mjs',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-types-should-be-first'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when types is first', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.mjs',
          default: './dist/index.mjs',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-types-should-be-first'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/exports-default-should-be-last', () => {
  it('flags default not being last', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          default: './dist/index.mjs',
          import: './dist/index.mjs',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-default-should-be-last'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when default is last', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.mjs',
          default: './dist/index.mjs',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-default-should-be-last'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/exports-module-should-precede-require', () => {
  it('flags module after require', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          require: './dist/index.cjs',
          module: './dist/index.mjs',
          default: './dist/index.mjs',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-module-should-precede-require'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when module precedes require', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          module: './dist/index.mjs',
          require: './dist/index.cjs',
          default: './dist/index.mjs',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-module-should-precede-require'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/exports-value-invalid', () => {
  it('flags exports values not starting with ./', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': 'dist/index.mjs',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-value-invalid'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes with valid exports values', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': './dist/index.mjs',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-value-invalid'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/exports-missing-root-entrypoint', () => {
  it('flags missing root entrypoint', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      main: './dist/index.js',
      exports: {
        './utils': './dist/utils.mjs',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-missing-root-entrypoint'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes with root entrypoint', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      main: './dist/index.js',
      exports: {
        '.': './dist/index.mjs',
        './utils': './dist/utils.mjs',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-missing-root-entrypoint'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/imports-key-invalid', () => {
  it('flags imports keys not starting with #', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      imports: {
        'utils': './src/utils.js',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/imports-key-invalid'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes with valid # prefixed keys', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      imports: {
        '#utils': './src/utils.js',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/imports-key-invalid'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/imports-default-should-be-last', () => {
  it('flags default not being last in imports', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      imports: {
        '#utils': {
          default: './src/utils.js',
          node: './src/utils-node.js',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/imports-default-should-be-last'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when default is last in imports', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      imports: {
        '#utils': {
          node: './src/utils-node.js',
          default: './src/utils.js',
        },
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/imports-default-should-be-last'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/file-does-not-exist', () => {
  it('flags main pointing to non-existent file', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      main: './dist/index.js',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/file-does-not-exist'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when referenced file exists', async () => {
    const dir = tmp()
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.js'), 'module.exports = {}', 'utf8')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      main: './dist/index.js',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/file-does-not-exist'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/bin-file-not-executable', () => {
  it('flags bin file without shebang', async () => {
    const dir = tmp()
    mkdirSync(join(dir, 'bin'), { recursive: true })
    writeFileSync(join(dir, 'bin', 'cli.js'), 'console.log("hello")', 'utf8')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      bin: './bin/cli.js',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/bin-file-not-executable'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when bin file has shebang', async () => {
    const dir = tmp()
    mkdirSync(join(dir, 'bin'), { recursive: true })
    writeFileSync(join(dir, 'bin', 'cli.js'), '#!/usr/bin/env node\nconsole.log("hello")', 'utf8')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      bin: './bin/cli.js',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/bin-file-not-executable'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/module-should-be-esm', () => {
  it('flags module pointing to CJS file', async () => {
    const dir = tmp()
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.js'), 'module.exports = { hello: "world" }', 'utf8')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      module: './dist/index.js',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/module-should-be-esm'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes when module points to ESM file', async () => {
    const dir = tmp()
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.mjs'), 'export const hello = "world"', 'utf8')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      module: './dist/index.mjs',
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/module-should-be-esm'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})

describe('publint/exports-fallback-array-use', () => {
  it('warns against fallback arrays in exports', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': ['./dist/index.mjs', './dist/index.js'],
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-fallback-array-use'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(1)
  })

  it('passes without fallback arrays', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': './dist/index.mjs',
      },
    }, null, 2) + '\n', 'utf8')
    const cfgPath = writeConfig(dir, enableRule('publint/exports-fallback-array-use'))
    const code = await runLint([dir], { config: cfgPath, reporter: 'json' })
    expect(code).toBe(0)
  })
})
