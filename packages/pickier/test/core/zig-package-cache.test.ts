import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { defaultConfig } from '../../src/config'
import { runLintProgrammatic } from '../../src/index'
import { createIgnoreMatcher } from '../../src/utils'

test('lint scans owned source beside root and nested Zig package caches', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pickier-zig-packages-'))
  const owned = ['src/main.ts', 'src/zig-pkg-app/index.ts']
  const cached = ['zig-pkg/dependency/src/main.ts', 'packages/engine/zig-pkg/dependency/bench.ts']
  try {
    for (const path of [...owned, ...cached]) {
      const file = join(directory, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, 'debugger\n')
    }
    const result = await runLintProgrammatic([directory], { reporter: 'json', maxWarnings: -1 })
    expect([...new Set(result.issues.map(issue => issue.filePath))].sort()).toEqual(owned.map(path => join(directory, path)).sort())
    const matches = createIgnoreMatcher(defaultConfig.ignores, directory)
    for (const path of cached) expect(matches(join(directory, path))).toBe(true)
    const custom = createIgnoreMatcher(['**/fixtures/**'], directory)
    for (const path of cached) expect(custom(join(directory, path))).toBe(true)
    for (const path of owned) expect(matches(join(directory, path))).toBe(false)
  }
  finally { rmSync(directory, { recursive: true, force: true }) }
})
