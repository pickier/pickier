import type { LintIssue, RuleModule } from '../../types'

/**
 * Return the 0-indexed lines that are REAL fence boundaries (openers and
 * their matching closers). Lines that merely look like fences but sit
 * inside another fence — e.g. a ``` example documented inside a ~~~ block —
 * are content and must not be styled or rewritten.
 */
function fenceBoundaryLines(lines: string[]): Set<number> {
  const out = new Set<number>()
  let fenceChar: '`' | '~' | null = null
  let fenceLen = 0
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (fenceChar === null) {
      const open = trimmed.match(/^(`{3,}|~{3,})(.*)$/)
      if (open) {
        const ch = open[1][0] as '`' | '~'
        // CommonMark: a backtick fence's info string cannot contain backticks
        if (ch === '`' && open[2].includes('`'))
          continue
        fenceChar = ch
        fenceLen = open[1].length
        out.add(i)
      }
    }
    else {
      const close = trimmed.match(/^(`{3,}|~{3,})\s*$/)
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        out.add(i)
        fenceChar = null
        fenceLen = 0
      }
    }
  }
  return out
}

/**
 * MD048 - Code fence style
 */
export const codeFenceStyleRule: RuleModule = {
  meta: {
    docs: 'Code fence style should be consistent (backtick or tilde)',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const boundaries = fenceBoundaryLines(lines)

    const options = (ctx.options as { style?: 'backtick' | 'tilde' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'backtick' | 'tilde' | null = null

    for (const i of boundaries) {
      const line = lines[i]
      const isBacktick = /^`{3,}/.test(line.trim())
      const fenceStyle: 'backtick' | 'tilde' = isBacktick ? 'backtick' : 'tilde'

      if (style === 'backtick' || style === 'tilde') {
        if (fenceStyle !== style) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/code-fence-style',
            message: style === 'tilde' ? 'Expected tilde (~~~) code fence' : 'Expected backtick (```) code fence',
            severity: 'error',
          })
        }
      }
      else if (style === 'consistent') {
        if (detectedStyle === null) {
          detectedStyle = fenceStyle
        }
        else if (detectedStyle !== fenceStyle) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/code-fence-style',
            message: 'Code fence style should be consistent throughout document',
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const options = (ctx.options as { style?: 'backtick' | 'tilde' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    const lines = text.split(/\r?\n/)
    const boundaries = fenceBoundaryLines(lines)

    // Determine target fence style
    let targetStyle: 'backtick' | 'tilde' = 'backtick'
    if (style === 'backtick' || style === 'tilde') {
      targetStyle = style
    }
    else {
      // consistent: match the first real fence in the document
      for (const i of boundaries) {
        targetStyle = /^`{3,}/.test(lines[i].trim()) ? 'backtick' : 'tilde'
        break
      }
    }

    const targetChar = targetStyle === 'backtick' ? '`' : '~'
    const sourceRun = targetStyle === 'backtick' ? /^(\s*)(~{3,})(.*)$/ : /^(\s*)(`{3,})(.*)$/

    const fixedLines = lines.map((line, i) => {
      if (!boundaries.has(i))
        return line
      // Preserve the run length so >=3-char closers keep matching their opener
      return line.replace(sourceRun, (_m, ws, run, rest) => `${ws}${targetChar.repeat(run.length)}${rest}`)
    })
    return fixedLines.join('\n')
  },
}
