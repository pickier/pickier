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
import { buildSourceMap, tokenize } from '../../ast'
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

interface ImportSpan {
  start: number
  end: number
  bindings: ImportBinding[]
}

/** Parse declaration tokens, so a statement can end anywhere on a line. */
function importSpans(text: string): ImportSpan[] {
  const tokens = tokenize(text).filter(token => token.type !== 'LineComment' && token.type !== 'BlockComment')
  const locations = buildSourceMap(text)
  const spans: ImportSpan[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'Word' || tokens[i].value !== 'import' || tokens[i - 1]?.value === '.')
      continue
    const start = i
    let cursor = i + 1
    let typeOnly = false
    const bindings: ImportBinding[] = []
    const record = (index: number, type: boolean): void => {
      const token = tokens[index]
      if (!token || token.type !== 'Word' || !/^[A-Z_$][\w$]*$/i.test(token.value))
        return
      const loc = locations.indexToLoc(token.start)
      bindings.push({ name: token.value, line: loc.line, column: loc.column - 1, typeOnly: type })
    }
    // `import type from 'pkg'` binds a default value named `type`.
    if (tokens[cursor]?.value === 'type' && (['{', '*'].includes(tokens[cursor + 1]?.value) || (tokens[cursor + 1]?.type === 'Word' && tokens[cursor + 1]?.value !== 'from'))) {
      typeOnly = true
      cursor++
    }
    if (tokens[cursor]?.type !== 'String') {
      if (tokens[cursor]?.type === 'Word') {
        record(cursor++, typeOnly)
        if (tokens[cursor]?.value === ',')
          cursor++
      }
      if (tokens[cursor]?.value === '*') {
        cursor++
        if (tokens[cursor++]?.value !== 'as' || tokens[cursor]?.type !== 'Word')
          continue
        record(cursor++, typeOnly)
      }
      else if (tokens[cursor]?.value === '{') {
        cursor++
        let valid = true
        while (cursor < tokens.length && tokens[cursor].value !== '}') {
          let specifierType = typeOnly
          if (tokens[cursor].value === 'type' && ![',', '}', 'as'].includes(tokens[cursor + 1]?.value)) {
            specifierType = true
            cursor++
          }
          let local = cursor++
          if (!['Word', 'String'].includes(tokens[local]?.type)) {
            valid = false
            break
          }
          if (tokens[cursor]?.value === 'as') {
            cursor++
            local = cursor++
          }
          record(local, specifierType)
          if (tokens[cursor]?.value !== ',')
            break
          cursor++
        }
        if (!valid || tokens[cursor++]?.value !== '}')
          continue
      }
      if (tokens[cursor++]?.value !== 'from')
        continue
    }
    const source = tokens[cursor]
    if (source?.type !== 'String' || source.value.length < 2 || source.value[source.value.length - 1] !== source.value[0])
      continue
    let end = source.end
    cursor++
    if (['with', 'assert'].includes(tokens[cursor]?.value) && tokens[cursor + 1]?.value === '{') {
      cursor += 2
      let depth = 1
      while (cursor < tokens.length && depth > 0) {
        const token = tokens[cursor++]
        if (token.value === '{') depth++
        if (token.value === '}') depth--
        end = token.end
      }
      if (depth !== 0)
        continue
    }
    if (tokens[cursor]?.value === ';')
      end = tokens[cursor++].end
    spans.push({ start: tokens[start].start, end, bindings })
    i = cursor - 1
  }
  return spans
}

export const noUnusedImportsRule: RuleModule = {
  meta: { docs: 'Disallow imports that nothing in the file uses' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const spans = importSpans(text)
    const bindings = spans.flatMap(span => span.bindings)
    if (bindings.length === 0)
      return issues

    // Mask exact declaration spans while preserving uses and UTF-16 locations
    // before or after an import on the same line.
    let body = ''
    let from = 0
    for (const span of spans) {
      body += text.slice(from, span.start) + text.slice(span.start, span.end).replace(/[^\r\n\u2028\u2029]/g, ' ')
      from = span.end
    }
    body += text.slice(from)
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
