type ShellContext = { kind: 'single' | 'double' | 'ansi' | 'backtick' | 'command' | 'parameter', depth: number }

export interface ShellSourceLine {
  text: string
  masked: string
  /** Leading whitespace belongs to a quoted value or heredoc. */
  protectedStart: boolean
  /** Trailing whitespace belongs to a quoted value or heredoc. */
  protectedEnd: boolean
  heredoc: boolean
}

/** Scan the whole source: shell quotes and substitutions can span lines. */
export function shellSourceLines(content: string): ShellSourceLine[] {
  const stack: ShellContext[] = []
  const pending: Array<{ delimiter: string, stripTabs: boolean }> = []
  let body: typeof pending[number] | undefined
  const quoted = () => stack.some(context => ['single', 'double', 'ansi', 'backtick'].includes(context.kind))
  return content.split(/\r?\n/).map((text): ShellSourceLine => {
    if (body) {
      const delimiter = body.stripTabs ? text.replace(/^\t+/, '') : text
      if (delimiter === body.delimiter)
        body = pending.shift()
      return { text, masked: ' '.repeat(text.length), protectedStart: true, protectedEnd: true, heredoc: true }
    }
    const protectedStart = quoted()
    const out = Array.from(text)
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const context = stack.at(-1)
      if (context)
        out[i] = ' '
      if (context?.kind === 'single') {
        if (ch === "'") {
          out[i] = ch
          stack.pop()
        }
        continue
      }
      if (ch === '\\') {
        // An escaped delimiter cannot open/close a quote. Keep an unquoted
        // terminal backslash visible to continuation indentation.
        if (i + 1 < text.length) {
          out[i] = ' '
          out[++i] = ' '
        }
        else {
          out[i] = ch
        }
        continue
      }
      if (context?.kind === 'ansi' || context?.kind === 'backtick') {
        if (ch === (context.kind === 'ansi' ? "'" : '`')) {
          out[i] = ch
          stack.pop()
        }
        continue
      }
      if (context?.kind === 'double' && ch === '"') {
        out[i] = ch
        stack.pop()
        continue
      }
      if (ch === '$' && (text[i + 1] === '(' || text[i + 1] === '{')) {
        out[i] = ch
        out[++i] = text[i]
        stack.push({ kind: text[i] === '(' ? 'command' : 'parameter', depth: 1 })
        continue
      }
      if (context?.kind === 'double') {
        if (ch === '`') {
          out[i] = ch
          stack.push({ kind: 'backtick', depth: 1 })
        }
        continue
      }
      if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
        out.fill(' ', i)
        break
      }
      if (ch === '<' && text[i - 1] !== '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
        const match = text.slice(i).match(/^<<(-?)\s*(['"]?)(\w+)\2/)
        if (match)
          pending.push({ delimiter: match[3], stripTabs: match[1] === '-' })
      }
      if (ch === '$' && text[i + 1] === "'") {
        out[i] = ch
        out[++i] = text[i]
        stack.push({ kind: 'ansi', depth: 1 })
        continue
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        out[i] = ch
        stack.push({ kind: ch === "'" ? 'single' : ch === '"' ? 'double' : 'backtick', depth: 1 })
        continue
      }
      if (context?.kind === 'command' || context?.kind === 'parameter') {
        const open = context.kind === 'command' ? '(' : '{'
        const close = context.kind === 'command' ? ')' : '}'
        if (ch === open) {
          out[i] = ch
          context.depth++
        }
        if (ch === close) {
          out[i] = ch
          if (--context.depth === 0)
            stack.pop()
        }
      }
    }
    const protectedEnd = quoted()
    body = pending.shift()
    return { text, masked: out.join(''), protectedStart, protectedEnd, heredoc: false }
  })
}

/** Preserve columns and delimiters while hiding strings, expansions and comments. */
export function maskShellStrings(content: string): string {
  return shellSourceLines(content).map(line => line.masked).join('\n')
}

/**
 * Track heredoc start and end within a line-by-line scan. Returns the
 * delimiter recognised at this line, or `null` if this line does not start a
 * heredoc. The caller tracks state by flipping a boolean when
 * `heredocDelimiter` returns non-null, and clearing it when the delimiter
 * matches a subsequent line's trimmed content.
 */
export function heredocDelimiter(line: string): string | null {
  // Locate the operator on the MASKED line so a `<<` inside a string never
  // counts, but read the delimiter from the ORIGINAL line — masking blanks
  // the interior of quoted delimiters (`<< 'EOF'` becomes `<< '   '`).
  const masked = maskShellStrings(line)
  const m = masked.match(/<<-?/)
  if (!m || m.index === undefined)
    return null
  const after = line.slice(m.index + m[0].length)
  const delim = after.match(/^\s*(['"]?)(\w+)\1/)
  if (!delim)
    return null
  return delim[2]
}
