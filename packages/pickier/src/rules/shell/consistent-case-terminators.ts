import type { RuleModule } from '../../types'
import { heredocDelimiter, maskShellStrings } from './_shared'

/**
 * Enforce consistent placement of case statement terminators (;;).
 * Each case branch must end with ;; before the next pattern or the closing
 * `esac`. The rule walks the case body honoring nested block structure so
 * `)` characters inside `for ... done`, `while ... done`, `if ... fi`, and
 * `$(...)` subshells are not mistaken for the next case pattern.
 */
export const consistentCaseTerminatorsRule: RuleModule = {
  meta: {
    docs: 'Enforce consistent case statement terminator placement',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''

    // Precompute masked content for each line. Lines inside a heredoc or
    // starting with `#` are treated as empty so they don't affect depth.
    const masked: string[] = []
    for (const line of lines) {
      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        masked.push('')
        continue
      }
      const delim = heredocDelimiter(line)
      if (delim) {
        inHeredoc = true
        heredocDelim = delim
      }
      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#')) {
        masked.push('')
        continue
      }
      masked.push(maskShellStrings(line))
    }

    // Find all `case ... in` start lines and their matching `esac`.
    for (let start = 0; start < masked.length; start++) {
      if (!/\bcase\b[\s\S]*\bin\s*$/.test(masked[start].trimEnd()))
        continue

      let depth = 1
      let esacIdx = -1
      for (let i = start + 1; i < masked.length; i++) {
        const m = masked[i].trimEnd()
        if (/^\s*esac\b/.test(m)) {
          depth--
          if (depth === 0) {
            esacIdx = i
            break
          }
          continue
        }
        if (/\bcase\b[\s\S]*\bin\s*$/.test(m))
          depth++
      }
      if (esacIdx === -1)
        continue

      // Walk the body of this case, tracking block depth for
      // if/for/while/until so `)` inside a nested block body isn't
      // interpreted as a pattern close.
      let blockDepth = 0
      let awaitingTerminator = false
      let hadPattern = false

      for (let i = start + 1; i < esacIdx; i++) {
        const m = masked[i]
        const trimmed = m.trim()
        if (trimmed === '')
          continue

        if (blockDepth === 0) {
          const patternEnd = findPatternClose(m)
          if (patternEnd !== -1) {
            if (awaitingTerminator && hadPattern) {
              issues.push({
                filePath: ctx.filePath,
                line: i + 1,
                column: 1,
                ruleId: 'shell/consistent-case-terminators',
                message: 'Missing ;; terminator for previous case branch',
                severity: 'warning',
                help: 'Add ;; at the end of the case branch before the next pattern',
              })
            }
            awaitingTerminator = true
            hadPattern = true
            // Handle single-line branches: `a) cmd ;;`
            const rest = m.slice(patternEnd + 1).trimEnd()
            if (/;;\s*$/.test(rest))
              awaitingTerminator = false
            continue
          }
        }

        blockDepth += netBlockDelta(m)
        if (blockDepth < 0)
          blockDepth = 0

        if (awaitingTerminator && blockDepth === 0 && /;;\s*$/.test(trimmed))
          awaitingTerminator = false
      }
    }

    return issues
  },
}

/**
 * Return the index of the terminating `)` for a case pattern on this line,
 * or -1 if the line is not a pattern line. A pattern line begins (after
 * optional whitespace) with `(pattern)` or `pattern)` where the `)` closes
 * the pattern rather than an expression.
 */
function findPatternClose(masked: string): number {
  const trimmed = masked.replace(/^\s+/, '')
  if (trimmed === '')
    return -1
  if (/^(?:for|while|until|if|case|do|then|else|elif|fi|done|esac)\b/.test(trimmed))
    return -1

  const startOffset = masked.length - trimmed.length
  let i = 0
  if (trimmed[i] === '(')
    i++
  let parenDepth = 0
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === '(')
      parenDepth++
    else if (ch === ')') {
      if (parenDepth === 0)
        return startOffset + i
      parenDepth--
    }
    // Disallowed in a case pattern: `=` (assignment), `;` (separator),
    // `<`, `>` (redirection), `&` (background / `&&`). `|` is allowed
    // because bash case patterns use it for alternation (`a|b|c)`).
    else if (ch === ';' || ch === '&' || ch === '<' || ch === '>' || ch === '=')
      return -1
    i++
  }
  return -1
}

/**
 * Compute the net change in block depth contributed by this masked line,
 * based on unmistakable keyword openers (if/for/while/until) and closers
 * (fi/done). `case ... esac` and `do ... done` pairs balance out; single-line
 * constructs like `for i in 1; do cmd; done` produce zero net delta.
 */
function netBlockDelta(masked: string): number {
  const trimmed = masked.trim()
  if (trimmed === '')
    return 0
  const tokens = trimmed.split(/[\s;]+/)
  let delta = 0
  for (const tok of tokens) {
    if (tok === 'if' || tok === 'for' || tok === 'while' || tok === 'until')
      delta++
    else if (tok === 'fi' || tok === 'done')
      delta--
  }
  return delta
}
