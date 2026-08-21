import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLintProgrammatic } from '../../src/linter'

// Regression tests for #1409: a project config that configures a rule must
// reach that rule, whichever map it was written in.
//
// `rules` and `pluginRules` are both user-facing severity maps, but only
// `pluginRules` was ever consulted when planning plugin rules — so a
// `rules: { 'pickier/sort-tailwind-classes': 'off' }` in a project config
// silently did nothing, for all 330 plugin rules. The built-in scan had the
// mirror-image problem: it read `rules` under hand-written camelCase keys and
// hardcoded each rule's reported severity, so only the rules someone had
// special-cased (`quotes`, `indent`) had an opt-out at all, and none of them
// could be escalated or demoted.
//
// Every case below configures the rule through `rules` — the half that was
// broken — and asserts all three severities, so "off silences it" and "the
// configured severity is what gets reported" can never drift apart again.

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-sev-gate-'))
}

interface Sample {
  /** File name (its extension decides which rules get a chance to run) */
  file: string
  source: string
  /** The id the rule reports under, which is not always the config key */
  reportedAs: string
}

/**
 * Lint `sample` with `configKey` set to `severity`, and return the severity
 * the rule actually reported at — or undefined when it stayed silent.
 */
async function severityUnder(
  sample: Sample,
  configKey: string,
  severity: 'off' | 'warn' | 'error',
  map: 'rules' | 'pluginRules' = 'rules',
): Promise<'warning' | 'error' | undefined> {
  const dir = tmpDir()
  const ext = `.${sample.file.split('.').pop()}`
  const cfgPath = join(dir, 'cfg.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    // Only the sample's own extension, so the config file next to it is not
    // itself linted and cannot contribute issues.
    lint: { extensions: [ext], reporter: 'json', cache: false, maxWarnings: -1 },
    [map]: { [configKey]: severity },
  }), 'utf8')

  writeFileSync(join(dir, sample.file), sample.source, 'utf8')

  const res = await runLintProgrammatic([dir], { config: cfgPath, reporter: 'json', maxWarnings: -1 })
  return res.issues.find(i => i.ruleId === sample.reportedAs)?.severity
}

/** One sample per plugin namespace, plus the built-in scan's own rules. */
const CASES: Array<{ name: string, configKey: string, sample: Sample }> = [
  {
    name: 'pickier/sort-tailwind-classes',
    configKey: 'pickier/sort-tailwind-classes',
    sample: { file: 'a.stx', source: '<div class="text-[13px] flex"></div>\n', reportedAs: 'pickier/sort-tailwind-classes' },
  },
  {
    name: 'pickier/prefer-const',
    configKey: 'pickier/prefer-const',
    sample: { file: 'a.ts', source: 'let a = 1\nexport default a\n', reportedAs: 'prefer-const' },
  },
  {
    name: 'ts/no-top-level-await',
    configKey: 'ts/no-top-level-await',
    sample: { file: 'a.ts', source: 'const x = await Promise.resolve(1)\nexport default x\n', reportedAs: 'ts/no-top-level-await' },
  },
  {
    name: 'style/max-statements-per-line',
    configKey: 'style/max-statements-per-line',
    sample: { file: 'a.ts', source: 'const a = 1; const b = 2\nexport default a + b\n', reportedAs: 'max-statements-per-line' },
  },
  {
    name: 'regexp/no-unused-capturing-group',
    configKey: 'regexp/no-unused-capturing-group',
    sample: { file: 'a.ts', source: 'export const r = /(foo)bar/.test(\'x\')\n', reportedAs: 'regexp/no-unused-capturing-group' },
  },
  {
    // Bare ids apply to whichever plugin owns a rule by that name.
    name: 'bare id: no-top-level-await',
    configKey: 'no-top-level-await',
    sample: { file: 'a.ts', source: 'const x = await Promise.resolve(1)\nexport default x\n', reportedAs: 'ts/no-top-level-await' },
  },
  {
    name: 'bare id: sort-tailwind-classes',
    configKey: 'sort-tailwind-classes',
    sample: { file: 'a.stx', source: '<div class="text-[13px] flex"></div>\n', reportedAs: 'pickier/sort-tailwind-classes' },
  },
  {
    // Built-in scan rules, addressed by the id they report under rather than
    // the legacy camelCase key.
    name: 'built-in: no-console',
    configKey: 'no-console',
    sample: { file: 'a.ts', source: 'console.log(1)\n', reportedAs: 'no-console' },
  },
  {
    name: 'built-in: no-debugger',
    configKey: 'no-debugger',
    sample: { file: 'a.ts', source: 'export function f() {\n  debugger\n}\n', reportedAs: 'no-debugger' },
  },
  {
    name: 'built-in: quotes',
    configKey: 'quotes',
    sample: { file: 'a.ts', source: 'export const s = "hi"\n', reportedAs: 'quotes' },
  },
  {
    name: 'built-in: indent',
    configKey: 'indent',
    sample: { file: 'a.ts', source: 'export const x = {\n   a: 1,\n}\n', reportedAs: 'indent' },
  },
]

describe('rule severity gate (#1409)', () => {
  for (const { name, configKey, sample } of CASES) {
    describe(name, () => {
      it('reports at all when left alone', async () => {
        // Guards the sample itself: a case that stopped triggering its rule
        // would make the three assertions below vacuously true.
        expect(await severityUnder(sample, configKey, 'error')).toBeDefined()
      })

      it("'off' silences it", async () => {
        expect(await severityUnder(sample, configKey, 'off')).toBeUndefined()
      })

      it("'warn' reports it as a warning", async () => {
        expect(await severityUnder(sample, configKey, 'warn')).toBe('warning')
      })

      it("'error' reports it as an error", async () => {
        expect(await severityUnder(sample, configKey, 'error')).toBe('error')
      })

      it('honours the same setting written in pluginRules', async () => {
        expect(await severityUnder(sample, configKey, 'off', 'pluginRules')).toBeUndefined()
      })
    })
  }

  it('rules outranks pluginRules for the same id', async () => {
    // Only pluginRules ships defaults, so a plugin rule id appearing in
    // `rules` was written by hand and is the more deliberate of the two.
    const dir = tmpDir()
    const cfgPath = join(dir, 'cfg.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      lint: { extensions: ['.ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      pluginRules: { 'ts/no-top-level-await': 'error' },
      rules: { 'ts/no-top-level-await': 'off' },
    }), 'utf8')
    writeFileSync(join(dir, 'a.ts'), 'const x = await Promise.resolve(1)\nexport default x\n', 'utf8')

    const res = await runLintProgrammatic([dir], { config: cfgPath, reporter: 'json', maxWarnings: -1 })
    expect(res.issues.map(i => i.ruleId)).not.toContain('ts/no-top-level-await')
  })

  it('still honours the legacy camelCase keys for built-in rules', async () => {
    const dir = tmpDir()
    const cfgPath = join(dir, 'cfg.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      lint: { extensions: ['.ts'], reporter: 'json', cache: false, maxWarnings: -1 },
      rules: { noConsole: 'error', noDebugger: 'off' },
    }), 'utf8')
    writeFileSync(join(dir, 'a.ts'), 'console.log(1)\nexport function f() {\n  debugger\n}\n', 'utf8')

    const res = await runLintProgrammatic([dir], { config: cfgPath, reporter: 'json', maxWarnings: -1 })
    expect(res.issues.find(i => i.ruleId === 'no-console')?.severity).toBe('error')
    expect(res.issues.map(i => i.ruleId)).not.toContain('no-debugger')
  })

  it("'off' also stops the rule's fixer from rewriting the file", async () => {
    // A silenced rule that still edits on --fix is the same bug wearing a
    // different hat: the config said "leave this alone".
    const { runLint } = await import('../../src/linter')
    const { readFileSync } = await import('node:fs')

    const dir = tmpDir()
    const cfgPath = join(dir, 'cfg.json')
    writeFileSync(cfgPath, JSON.stringify({
      verbose: false,
      lint: { extensions: ['.stx'], reporter: 'json', cache: false, maxWarnings: -1 },
      rules: { 'pickier/sort-tailwind-classes': 'off' },
    }), 'utf8')
    const file = join(dir, 'a.stx')
    const src = '<div class="text-[13px] flex"></div>\n'
    writeFileSync(file, src, 'utf8')

    await runLint([dir], { config: cfgPath, fix: true, reporter: 'json' })
    expect(readFileSync(file, 'utf8')).toBe(src)
  })
})
