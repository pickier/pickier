/**
 * An import nothing uses.
 *
 * `no-unused-vars` covers declarations and parameters and never looked at
 * imports - value or type - so a binding could sit at the top of a file
 * indefinitely with nothing referring to it. A stale `import type` is the
 * quietest version: it costs nothing at runtime, survives every check, and is
 * indistinguishable from a live dependency when you are reading the file to
 * work out what it needs.
 *
 * The scan is textual, like the rest of this rule set, so the bar for reporting
 * is deliberately high: a name counts as used if it appears anywhere outside
 * its own import statement, with COMMENTS masked out.
 *
 * String contents are deliberately NOT masked, which makes a name mentioned
 * only inside a string read as used. That is a false negative, and it is the
 * direction to fail in: a template literal's `${…}` holds real code, so masking
 * string bodies would report an import that is used and only used there, and
 * acting on that report deletes a working line. A stale import that survives
 * because its name also appears in a message is a cosmetic loss; the other
 * mistake breaks the build.
 *
 * Shadowing is not tracked either - a local `const x` in one function counts as
 * a use of an imported `x`. Same reasoning.
 */

import type { RuleModule } from '../../types'
import { maskCommentText } from '../general/no-unused-vars'

/**
 * A pattern matching `name` as a whole identifier.
 *
 * Not `\b`, which is defined in terms of `\w` and therefore cannot see `$` as
 * part of a name: `\b\$\b` does not match the `$` in `` $`echo hi` ``, so
 * Bun's shell import read as unused - a false positive, on a line that acting
 * on the report would delete. The lookarounds spell out the identifier
 * alphabet instead.
 *
 * The name is escaped because `$` is also an anchor: interpolated raw, it would
 * match end-of-input rather than the character.
 */
function wholeIdentifier(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`)
}

interface ImportBinding {
  /** The local name introduced, which is what a use has to mention. */
  name: string
  /** 1-indexed line the binding is declared on. */
  line: number
  /** 0-indexed column of the name on that line. */
  column: number
  /** `import type { … }` or `{ type X }`, for the message. */
  typeOnly: boolean
}

/**
 * The local names an import statement introduces.
 *
 * `import d, { a, b as c, type T } from 'x'` binds `d`, `a`, `c` and `T`;
 * `import * as ns from 'x'` binds `ns`; `import 'x'` binds nothing, which is
 * the point of writing it, so a side-effect import is never reported.
 */
function bindingsOf(statement: string, startLine: number, lines: string[]): ImportBinding[] {
  const bindings: ImportBinding[] = []

  const isTypeImport = /^\s*import\s+type\b/.test(statement)
  const clause = statement.replace(/^\s*import\s+/, '').replace(/\s+from\s+['"][^'"]+['"].*$/s, '')

  // A side-effect import (`import 'x'`) has no clause to speak of.
  if (/^['"]/.test(clause))
    return bindings

  const record = (rawName: string, typeOnly: boolean): void => {
    const name = rawName.trim()
    if (!name || name === 'type')
      return

    /*
     * Only a real identifier gets reported. Anything else means this textual
     * parse misread the statement - and the consequence is not a bad message,
     * it is a crash: these names are interpolated into a `RegExp`, so a stray
     * `(` from a mis-parse threw "unmatched parentheses" and took the whole
     * rule down for that file. Silence on input we did not understand is the
     * correct answer for a rule whose reports get acted on by deleting lines.
     */
    if (!/^[A-Z_$][\w$]*$/i.test(name))
      return

    // Find where the name actually sits, so the report points at it rather
    // than at the start of the statement.
    for (let ln = startLine; ln < lines.length; ln++) {
      const column = lines[ln].search(wholeIdentifier(name))
      if (column !== -1) {
        bindings.push({ name, line: ln + 1, column, typeOnly })
        return
      }
      // Stop at the end of the statement.
      if (/\bfrom\b/.test(lines[ln]))
        break
    }

    bindings.push({ name, line: startLine + 1, column: 0, typeOnly })
  }

  // Named bindings, which may carry their own per-specifier `type`.
  const braces = clause.match(/\{([\s\S]*)\}/)
  if (braces) {
    for (const piece of braces[1].split(',')) {
      const trimmed = piece.trim()
      if (!trimmed)
        continue
      const perSpecifierType = /^type\s+/.test(trimmed)
      const withoutType = trimmed.replace(/^type\s+/, '')
      // `b as c` binds `c`; a plain `a` binds `a`.
      const aliased = withoutType.split(/\s+as\s+/)
      record(aliased[aliased.length - 1], isTypeImport || perSpecifierType)
    }
  }

  // Default and namespace bindings, i.e. everything before the braces.
  const beforeBraces = braces ? clause.slice(0, clause.indexOf('{')) : clause
  for (const piece of beforeBraces.split(',')) {
    const trimmed = piece.trim().replace(/^type\s+/, '')
    if (!trimmed)
      continue
    const namespace = trimmed.match(/^\*\s+as\s+(\w+)$/)
    record(namespace ? namespace[1] : trimmed, isTypeImport)
  }

  return bindings
}

export const noUnusedImportsRule: RuleModule = {
  meta: { docs: 'Disallow imports that nothing in the file uses' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    const bindings: ImportBinding[] = []
    /** Lines belonging to an import statement, which a use may not come from. */
    const importLines = new Set<number>()

    for (let i = 0; i < lines.length; i++) {
      /*
       * A `import` STATEMENT, not `import(…)` or `import.meta`.
       *
       * `/^\s*import\b/` matched a dynamic import too, and the damage was not
       * a spurious binding: the scan then ran forward looking for a `from`
       * clause that a call expression does not have, swallowing dozens of real
       * lines as "part of the import" and blanking them out of the search body.
       * Every genuinely-used name in that stretch then read as unused. One
       * `import('@stacksjs/logging').then(…)` in the middle of a file was
       * enough to make it report imports the file uses six times.
       */
      if (!/^\s*import\s*(?![(.])/.test(lines[i]))
        continue

      /*
       * Collect the whole statement, which may wrap across lines - bounded, so
       * a form this scanner does not understand costs one misread statement
       * rather than the rest of the file.
       */
      let statement = lines[i]
      let end = i
      const limit = Math.min(lines.length - 1, i + 40)
      while (end < limit && !/\bfrom\s*['"][^'"]*['"]/.test(statement) && !/^\s*import\s*['"]/.test(statement)) {
        end++
        statement += `\n${lines[end]}`
      }

      // Never found a `from`: not a statement this rule understands.
      if (!/\bfrom\s*['"][^'"]*['"]/.test(statement) && !/^\s*import\s*['"]/.test(statement))
        continue

      for (let ln = i; ln <= end; ln++)
        importLines.add(ln)

      bindings.push(...bindingsOf(statement, i, lines))
      i = end
    }

    if (bindings.length === 0)
      return issues

    /*
     * Everything that is not an import statement, with comments masked - a name
     * mentioned only in a comment is not a use. Strings are left intact on
     * purpose; see the note at the top of this file.
     */
    const body = lines
      .map((line, index) => (importLines.has(index) ? '' : line))
      .join('\n')
    const searchable = maskCommentText(body)

    for (const binding of bindings) {
      if (wholeIdentifier(binding.name).test(searchable))
        continue

      issues.push({
        filePath: ctx.filePath,
        line: binding.line,
        column: binding.column + 1,
        ruleId: 'pickier/no-unused-imports',
        message: binding.typeOnly
          ? `'${binding.name}' is imported as a type but never used`
          : `'${binding.name}' is imported but never used`,
        severity: 'error',
      })
    }

    return issues
  },
}
