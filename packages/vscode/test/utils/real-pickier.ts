// `mock.module(...)` is global to a `bun test` run and the last registration
// wins, so a file that mocks `pickier` changes what every file loaded after it
// sees - including the `await import('pickier')` calls inside src/. That made
// the suite order-dependent: `code-actions.test.ts` passed alone and failed
// behind a mocking file, `diagnostics.test.ts` did the reverse, and CI's bun
// ordered the files differently from a local run.
//
// So each file states which one it wants at module level. A file that needs
// the real linter calls `useRealPickier()`; one that wants canned answers
// registers its own mock. Either way the file no longer depends on what ran
// before it.
import { mock } from 'bun:test'
// Imported by path, which no `mock.module('pickier')` intercepts.
import * as realPickier from '../../../pickier/src/index'

export function useRealPickier(): void {
  mock.module('pickier', () => realPickier)
}
