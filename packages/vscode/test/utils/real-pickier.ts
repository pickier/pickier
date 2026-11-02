// `mock.module(...)` is global to a `bun test` process and cannot be undone:
// re-registering a specifier after it has been resolved has no effect, in a
// hook or in a test body. So one process has exactly one `pickier`, and a file
// that stubs it decides what every other file sees - including the
// `await import('pickier')` calls inside src/.
//
// Hence the split. test/real holds the files that exercise the real linter and
// stubs nothing; test/unit holds the ones that stub it to watch the extension's
// wiring. They run as two processes (see the package's `test` script), which is
// what keeps either from deciding the other's outcome. Before the split the
// suite passed only in one file order: code-actions.test.ts passed alone and
// failed in CI behind a stub, diagnostics.test.ts did the reverse.
import { mock } from 'bun:test'
// Imported by path, so this is the real module even if something registers a
// stub for the bare specifier.
import * as realPickier from '../../../pickier/src/index'

/**
 * Pin `pickier` to the real implementation for this file.
 *
 * Nothing in test/real stubs it, so this is belt and braces: it keeps the
 * intent on the page, and makes a stub added to this directory by mistake
 * fail loudly here rather than quietly change another file's linting.
 */
export function useRealPickier(): void {
  mock.module('pickier', () => realPickier)
}
