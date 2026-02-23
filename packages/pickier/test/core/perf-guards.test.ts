/**
 * Performance guard tests
 *
 * These tests verify that key performance optimizations remain in place.
 * They prevent accidental regressions that would slow down the CLI or
 * in-memory formatting.
 */
import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SRC_DIR = resolve(__dirname, '../../src')

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-perf-guard-'))
}

// ---------------------------------------------------------------------------
// 1. Structural guards — verify import topology stays fast
// ---------------------------------------------------------------------------

describe('import topology', () => {
  it('cli.ts does not statically import index.ts or clapp', () => {
    const src = readFileSync(resolve(__dirname, '../../bin/cli.ts'), 'utf8')
    // Must NOT import index.ts (re-exports linter, formatter, plugins — all heavyweight)
    expect(src).not.toMatch(/from\s+['"]\.\.\/src\/index\.ts['"]/)
    expect(src).not.toMatch(/from\s+['"]\.\.\/src\/index['"]/)
    // clapp must be dynamically imported, not statically (saves ~5ms on format fast path)
    expect(src).not.toMatch(/^import\s+\{[^}]*CLI[^}]*\}\s+from\s+['"]@stacksjs\/clapp['"]/m)
    expect(src).toMatch(/import\(['"]@stacksjs\/clapp['"]\)/)
  })

  it('cli.ts has ultra-fast argv parsing for format commands', () => {
    const src = readFileSync(resolve(__dirname, '../../bin/cli.ts'), 'utf8')
    // Must parse process.argv directly for common format commands
    // to bypass the CLI framework entirely on the hot path
    expect(src).toContain('process.argv')
    expect(src).toContain("argv[0] === 'run'")
    expect(src).toContain("mode === 'format'")
  })

  it('run.ts does NOT statically import linter.ts', () => {
    const src = readFileSync(join(SRC_DIR, 'run.ts'), 'utf8')
    // Static import of linter would pull in plugins Logger
    // at startup, adding ~30ms to every CLI invocation
    expect(src).not.toMatch(/^import\s+.*from\s+['"]\.\/linter['"]/m)
  })

  it('run.ts uses dynamic import() for linter.ts', () => {
    const src = readFileSync(join(SRC_DIR, 'run.ts'), 'utf8')
    // Must use dynamic import so linter.ts is only loaded when lint mode is needed
    expect(src).toMatch(/import\(['"]\.\/linter['"]\)/)
  })

  it('run.ts statically imports format.ts for fast path', () => {
    const src = readFileSync(join(SRC_DIR, 'run.ts'), 'utf8')
    // formatCode must be available without loading linter.ts
    expect(src).toMatch(/from\s+['"]\.\/format['"]/)
    expect(src).toContain('formatCode')
  })

  it('run.ts has inline format-only fast path for single files', () => {
    const src = readFileSync(join(SRC_DIR, 'run.ts'), 'utf8')
    // The fast path avoids linter.ts entirely for `--mode format` with a single file
    expect(src).toContain('formatCode(src, cfg, filePath)')
    expect(src).toContain('statSync')
  })
})

// ---------------------------------------------------------------------------
// 2. Deferred Logger — avoid constructor overhead on startup
// ---------------------------------------------------------------------------

describe('deferred Logger pattern', () => {
  it('linter.ts defers Logger construction', () => {
    const src = readFileSync(join(SRC_DIR, 'linter.ts'), 'utf8')
    // Logger must be lazily constructed, not created at module level
    expect(src).toContain('let _logger')
    expect(src).toContain('function getLogger()')
    // Must NOT have a top-level `new Logger` or `const logger = new Logger`
    expect(src).not.toMatch(/^const logger\s*=\s*new Logger/m)
  })

  it('formatter.ts defers Logger construction', () => {
    const src = readFileSync(join(SRC_DIR, 'formatter.ts'), 'utf8')
    expect(src).toContain('let _logger')
    expect(src).toContain('function getLogger()')
    expect(src).not.toMatch(/^const logger\s*=\s*new Logger/m)
  })
})

// ---------------------------------------------------------------------------
// 3. Pre-compiled regex — avoid re-creation per line in hot loops
// ---------------------------------------------------------------------------

describe('pre-compiled regex patterns in format.ts', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  // These must be module-level constants (const RE_xxx = /.../)
  // not created inside functions on every call
  const expectedPatterns = [
    'RE_LEADING_WS',
    'RE_CLOSING_BRACE',
    'RE_OPENING_BRACE',
    'RE_FOR_LOOP',
    'RE_EMPTY_SEMI',
    'RE_DUP_SEMI',
    'RE_COMMA_SPACE',
    'RE_EQUALS_SPACE',
    'RE_BLANK_LINE',
    'RE_LINE_COMMENT',
    'RE_BLOCK_COMMENT',
    'RE_IMPORT_STMT',
    'RE_TRAILING_WS',
    'RE_LEADING_BLANKS',
  ]

  for (const name of expectedPatterns) {
    it(`${name} is defined at module level`, () => {
      // Must be a top-level const (not inside a function)
      const pattern = new RegExp(`^const ${name}\\s*=\\s*/`, 'm')
      expect(src).toMatch(pattern)
    })
  }
})

// ---------------------------------------------------------------------------
// 4. Dead code stays removed — functions that were superseded
// ---------------------------------------------------------------------------

describe('dead code removal', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('fixIndentation() is removed (superseded by processCodeLinesFused)', () => {
    expect(src).not.toMatch(/^(export\s+)?function fixIndentation\b/m)
  })

  it('normalizeCodeSpacing() is removed (superseded by processCodeLinesFused)', () => {
    expect(src).not.toMatch(/^(export\s+)?function normalizeCodeSpacing\b/m)
  })

  it('removeStylisticSemicolons() is removed (superseded by processCodeLinesFused)', () => {
    expect(src).not.toMatch(/^(export\s+)?function removeStylisticSemicolons\b/m)
  })
})

// ---------------------------------------------------------------------------
// 5. Format-only fast path in linter.ts — calls formatCode() directly
// ---------------------------------------------------------------------------

describe('format-only fast path in linter.ts', () => {
  const src = readFileSync(join(SRC_DIR, 'linter.ts'), 'utf8')

  it('has formatOnly fast path that calls formatCode() directly', () => {
    // The format-only path must call formatCode() directly, not applyPluginFixes()
    // applyPluginFixes iterates 13 plugins/hundreds of rules for zero benefit on code files
    expect(src).toMatch(/if\s*\(formatOnly\)\s*\{[\s\S]*?formatCode\(src/)
  })

  it('format-only path does NOT call applyPluginFixes', () => {
    // Extract the format-only block and verify it doesn't call applyPluginFixes
    const match = src.match(/if\s*\(formatOnly\)\s*\{([\s\S]*?)\n\s{6}\}/)
    expect(match).not.toBeNull()
    expect(match![1]).not.toContain('applyPluginFixes')
  })

  it('imports formatCode from format module', () => {
    expect(src).toMatch(/import\s*\{[^}]*formatCode[^}]*\}\s*from\s*['"]\.\/format['"]/)
  })
})

// ---------------------------------------------------------------------------
// 6. maskStrings() optimization — slice+join, not char-by-char concat
// ---------------------------------------------------------------------------

describe('maskStrings optimization', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('uses slice-based segment accumulation', () => {
    // Must use .slice() for efficient substring extraction, not += char-by-char
    const fnMatch = src.match(/function maskStrings\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    expect(fnBody).toContain('.slice(')
    expect(fnBody).toContain('parts.push(')
    expect(fnBody).toContain("parts.join('')")
  })

  it('has fast path for strings without quotes', () => {
    const fnMatch = src.match(/function maskStrings\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    // Should exit early when no quotes are present
    expect(fnBody).toContain("!input.includes('\\'')")
    expect(fnBody).toContain('!input.includes(\'"\')')
    expect(fnBody).toContain('!input.includes(\'`\')')
  })
})

// ---------------------------------------------------------------------------
// 7. fixQuotesLine() optimization — fast-path exit
// ---------------------------------------------------------------------------

describe('fixQuotesLine optimization', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('has fast-path exit when no target quotes to convert', () => {
    const fnMatch = src.match(/function fixQuotesLine\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    // Must return early when no quotes of the opposite style are found
    expect(fnBody).toContain('return line')
  })

  it('uses slice-based accumulation', () => {
    const fnMatch = src.match(/function fixQuotesLine\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    expect(fnBody).toContain('.slice(')
    expect(fnBody).toContain('parts')
  })
})

// ---------------------------------------------------------------------------
// 8. fixQuotes() delegates to fixQuotesLine() — no duplication
// ---------------------------------------------------------------------------

describe('fixQuotes deduplication', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('fixQuotes delegates to fixQuotesLine per line', () => {
    const fnMatch = src.match(/function fixQuotes\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    // Must call fixQuotesLine, not duplicate its logic
    expect(fnBody).toContain('fixQuotesLine(')
    // Should be a short function (~10 lines max), not a 90-line duplicate
    const lineCount = fnBody.split('\n').length
    expect(lineCount).toBeLessThan(15)
  })
})

// ---------------------------------------------------------------------------
// 9. Import detection uses indexOf, not dynamic RegExp
// ---------------------------------------------------------------------------

describe('import unused detection optimization', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('does NOT use dynamic RegExp for import name matching', () => {
    // `new RegExp(\`\\b${name}\\b\`)` per import name is O(n*m) and allocates
    // Should use indexOf + word boundary check instead
    expect(src).not.toContain('new RegExp(`\\\\b${')
    expect(src).not.toContain('new RegExp(`\\\\b${name}')
  })
})

// ---------------------------------------------------------------------------
// 10. Functional: run.ts format fast path produces correct output
// ---------------------------------------------------------------------------

describe('run.ts format fast path (functional)', () => {
  it('formats a single file correctly in write mode', async () => {
    const { runUnified } = await import('../../src/run')
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, 'const a = "hello"  \n\n\n\n', 'utf8')

    const code = await runUnified([file], { mode: 'format', write: true })
    expect(code).toBe(0)

    const out = readFileSync(file, 'utf8')
    // Should have trailing whitespace removed, blank lines collapsed, quotes fixed
    expect(out).not.toContain('  \n')
    expect(out).toContain("'hello'")
    expect(out.endsWith('\n')).toBe(true)
  })

  it('returns 0 in check mode (fast path)', async () => {
    const { runUnified } = await import('../../src/run')
    const dir = tmp()
    const file = join(dir, 'clean.ts')
    // Already-formatted content
    writeFileSync(file, 'const a = 1\n', 'utf8')

    const code = await runUnified([file], { mode: 'format', check: true })
    expect(code).toBe(0)
  })

  it('does not write in check mode', async () => {
    const { runUnified } = await import('../../src/run')
    const dir = tmp()
    const file = join(dir, 'check.ts')
    const original = 'const a = "hello"  \n\n\n\n'
    writeFileSync(file, original, 'utf8')

    await runUnified([file], { mode: 'format', check: true })
    const out = readFileSync(file, 'utf8')
    // File should be untouched in check mode
    expect(out).toBe(original)
  })

  it('falls through to linter for glob patterns', async () => {
    const { runUnified } = await import('../../src/run')
    const dir = tmp()
    writeFileSync(join(dir, 'a.ts'), 'const a = "hello"  \n', 'utf8')
    writeFileSync(join(dir, 'b.ts'), 'const b = "world"  \n', 'utf8')

    // Glob pattern should NOT use the fast path (it requires linter.ts)
    const code = await runUnified([`${dir}/**/*.ts`], { mode: 'format', write: true })
    expect(code).toBe(0)

    // Both files should be formatted
    const a = readFileSync(join(dir, 'a.ts'), 'utf8')
    const b = readFileSync(join(dir, 'b.ts'), 'utf8')
    expect(a).toContain("'hello'")
    expect(b).toContain("'world'")
  })
})

// ---------------------------------------------------------------------------
// 11. Functional: formatCode fast path correctness
// ---------------------------------------------------------------------------

describe('formatCode correctness', () => {
  it('handles trailing whitespace removal', async () => {
    const { formatCode } = await import('../../src/format')
    const { defaultConfig } = await import('../../src/config')
    const result = formatCode('const a = 1   \nconst b = 2  \n', defaultConfig, 'test.ts')
    expect(result).toBe('const a = 1\nconst b = 2\n')
  })

  it('handles quote normalization', async () => {
    const { formatCode } = await import('../../src/format')
    const { defaultConfig } = await import('../../src/config')
    const result = formatCode('const a = "hello"\n', defaultConfig, 'test.ts')
    expect(result).toContain("'hello'")
  })

  it('collapses excessive blank lines', async () => {
    const { formatCode } = await import('../../src/format')
    const { defaultConfig } = await import('../../src/config')
    const result = formatCode('const a = 1\n\n\n\n\nconst b = 2\n', defaultConfig, 'test.ts')
    // maxConsecutiveBlankLines defaults to 1
    expect(result).toBe('const a = 1\n\nconst b = 2\n')
  })

  it('returns identical input when already formatted', async () => {
    const { formatCode } = await import('../../src/format')
    const { defaultConfig } = await import('../../src/config')
    const input = 'const a = 1\n'
    const result = formatCode(input, defaultConfig, 'test.ts')
    expect(result).toBe(input)
  })

  it('handles JSON files', async () => {
    const { formatCode } = await import('../../src/format')
    const { defaultConfig } = await import('../../src/config')
    const input = '{"b": 1, "a": 2}\n'
    const result = formatCode(input, defaultConfig, 'test.json')
    // Should not crash on JSON; may or may not reformat
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 12. formatImports fast path — skip when no imports
// ---------------------------------------------------------------------------

describe('formatImports fast path', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('has early exit for files that do not start with import-like content', () => {
    const fnMatch = src.match(/export function formatImports\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    // Must check the first character to skip files without imports
    expect(fnBody).toContain('firstChar')
    expect(fnBody).toContain('return source')
  })
})

// ---------------------------------------------------------------------------
// 13. normalizeSpacingLine — fast-path character check before 11 regex passes
// ---------------------------------------------------------------------------

describe('normalizeSpacingLine character pre-check', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('has SPACING_CHARS set for fast-path check', () => {
    // Must check for operator/punctuation characters before running 11 regexes
    expect(src).toContain('SPACING_CHARS')
  })

  it('skips regex passes when no spacing characters present', () => {
    const fnMatch = src.match(/function normalizeSpacingLine\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    // Must have early return when no spacing chars found
    expect(fnBody).toContain('hasSpacingChar')
    expect(fnBody).toContain('if (!hasSpacingChar)')
    expect(fnBody).toContain('return line')
  })
})

// ---------------------------------------------------------------------------
// 14. processCodeLinesFused — manual char loop for leading whitespace
// ---------------------------------------------------------------------------

describe('processCodeLinesFused leading whitespace optimization', () => {
  const src = readFileSync(join(SRC_DIR, 'format.ts'), 'utf8')

  it('uses charCodeAt loop instead of regex for leading whitespace', () => {
    const fnMatch = src.match(/function processCodeLinesFused\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]
    // Must use manual char loop (charCodeAt) not RE_LEADING_WS.exec()
    expect(fnBody).toContain('charCodeAt')
    expect(fnBody).not.toContain('RE_LEADING_WS')
  })
})

// ---------------------------------------------------------------------------
// 15. Cached defaultConfig for NO_AUTO_CONFIG path
// ---------------------------------------------------------------------------

describe('cached defaultConfig', () => {
  const src = readFileSync(join(SRC_DIR, 'utils.ts'), 'utf8')

  it('caches the defaultConfig copy to avoid re-allocating on every call', () => {
    expect(src).toContain('_cachedDefaultConfig')
    // Must check cache before calling mergeConfig
    expect(src).toMatch(/if\s*\(!_cachedDefaultConfig\)/)
  })
})
