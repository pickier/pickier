/**
 * Replace the interiors of shell strings, parameter expansions, command
 * substitutions, and arithmetic expansions with spaces so regex-based rules
 * can operate on "bare shell code" without false positives from characters
 * that appear inside `$'...'`, `'...'`, `"..."`, `` `...` ``, `${...}`,
 * `$(...)`, `$((...))`, or trailing `# ...` comments.
 *
 * The returned string has the same length as the input so that indices
 * produced by matches on the masked line are valid indices in the original.
 *
 * Only *interior* characters are masked to spaces; structural delimiters
 * (`'`, `"`, `` ` ``, `$`, `(`, `)`, `{`, `}`) are preserved so that rules
 * can still reason about whether a token sits next to a string boundary —
 * e.g. `"$var"]` still reports the `"` as the character preceding `]`.
 */
export function maskShellStrings(line: string): string {
  const n = line.length
  const out: string[] = Array.from({ length: n }, (_, i) => line[i])

  let i = 0
  while (i < n) {
    const ch = line[i]

    // Trailing `#` comment — only when preceded by whitespace or at start
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      while (i < n) {
        out[i] = ' '
        i++
      }
      break
    }

    // ANSI-C quoted string $'...'
    if (ch === '$' && line[i + 1] === '\'') {
      i += 2
      while (i < n) {
        if (line[i] === '\\' && i + 1 < n) {
          out[i] = ' '
          out[i + 1] = ' '
          i += 2
          continue
        }
        if (line[i] === '\'') {
          i++
          break
        }
        out[i] = ' '
        i++
      }
      continue
    }

    // Localized $"..." — mask like a double-quoted string
    if (ch === '$' && line[i + 1] === '"') {
      i++
      i = maskDoubleQuoted(line, i, out)
      continue
    }

    // Parameter expansion ${...}
    if (ch === '$' && line[i + 1] === '{') {
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        const c = line[i]
        if (c === '\\' && i + 1 < n) {
          out[i] = ' '
          out[i + 1] = ' '
          i += 2
          continue
        }
        if (c === '\'') {
          i++
          while (i < n && line[i] !== '\'') {
            out[i] = ' '
            i++
          }
          if (i < n)
            i++
          continue
        }
        if (c === '"') {
          i = maskDoubleQuoted(line, i, out)
          continue
        }
        if (c === '{') {
          depth++
          i++
          continue
        }
        if (c === '}') {
          depth--
          i++
          continue
        }
        out[i] = ' '
        i++
      }
      continue
    }

    // Arithmetic $((...)) — check before $(...)
    if (ch === '$' && line[i + 1] === '(' && line[i + 2] === '(') {
      i += 3
      let depth = 2
      while (i < n && depth > 0) {
        const c = line[i]
        if (c === '(') {
          depth++
          i++
          continue
        }
        if (c === ')') {
          depth--
          i++
          continue
        }
        out[i] = ' '
        i++
      }
      continue
    }

    // Command substitution $(...)
    if (ch === '$' && line[i + 1] === '(') {
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        const c = line[i]
        if (c === '\\' && i + 1 < n) {
          out[i] = ' '
          out[i + 1] = ' '
          i += 2
          continue
        }
        if (c === '\'') {
          i++
          while (i < n && line[i] !== '\'') {
            out[i] = ' '
            i++
          }
          if (i < n)
            i++
          continue
        }
        if (c === '"') {
          i = maskDoubleQuoted(line, i, out)
          continue
        }
        if (c === '(') {
          depth++
          i++
          continue
        }
        if (c === ')') {
          depth--
          i++
          continue
        }
        out[i] = ' '
        i++
      }
      continue
    }

    // Single-quoted '...'
    if (ch === '\'') {
      i++
      while (i < n && line[i] !== '\'') {
        out[i] = ' '
        i++
      }
      if (i < n)
        i++
      continue
    }

    // Double-quoted "..."
    if (ch === '"') {
      i = maskDoubleQuoted(line, i, out)
      continue
    }

    // Backtick `...`
    if (ch === '`') {
      i++
      while (i < n && line[i] !== '`') {
        if (line[i] === '\\' && i + 1 < n) {
          out[i] = ' '
          out[i + 1] = ' '
          i += 2
          continue
        }
        out[i] = ' '
        i++
      }
      if (i < n)
        i++
      continue
    }

    i++
  }

  return out.join('')
}

function maskDoubleQuoted(line: string, start: number, out: string[]): number {
  const n = line.length
  // `out[start]` is the opening `"` — keep it.
  let i = start + 1
  while (i < n) {
    const c = line[i]
    if (c === '\\' && i + 1 < n) {
      out[i] = ' '
      out[i + 1] = ' '
      i += 2
      continue
    }
    if (c === '"')
      return i + 1
    if (c === '$' && line[i + 1] === '(' && line[i + 2] === '(') {
      i += 3
      let depth = 2
      while (i < n && depth > 0) {
        const x = line[i]
        if (x === '(') {
          depth++
          i++
          continue
        }
        if (x === ')') {
          depth--
          i++
          continue
        }
        out[i] = ' '
        i++
      }
      continue
    }
    if (c === '$' && line[i + 1] === '(') {
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        const x = line[i]
        if (x === '\\' && i + 1 < n) {
          out[i] = ' '
          out[i + 1] = ' '
          i += 2
          continue
        }
        if (x === '\'') {
          i++
          while (i < n && line[i] !== '\'') {
            out[i] = ' '
            i++
          }
          if (i < n)
            i++
          continue
        }
        if (x === '"') {
          i = maskDoubleQuoted(line, i, out)
          continue
        }
        if (x === '(') {
          depth++
          i++
          continue
        }
        if (x === ')') {
          depth--
          i++
          continue
        }
        out[i] = ' '
        i++
      }
      continue
    }
    if (c === '$' && line[i + 1] === '{') {
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        const x = line[i]
        if (x === '{') {
          depth++
          i++
          continue
        }
        if (x === '}') {
          depth--
          i++
          continue
        }
        out[i] = ' '
        i++
      }
      continue
    }
    out[i] = ' '
    i++
  }
  return i
}

/**
 * Track heredoc start and end within a line-by-line scan. Returns the
 * delimiter recognised at this line, or `null` if this line does not start a
 * heredoc. The caller tracks state by flipping a boolean when
 * `heredocDelimiter` returns non-null, and clearing it when the delimiter
 * matches a subsequent line's trimmed content.
 */
export function heredocDelimiter(line: string): string | null {
  // Only match heredoc on lines that aren't inside a string themselves.
  const masked = maskShellStrings(line)
  const m = masked.match(/<<-?\s*['"]?(\w+)['"]?/)
  if (!m)
    return null
  return m[1]
}
