import type { LintIssue, RuleModule } from '../../types'
import { getCodeBlockLines } from './_fence-tracking'

/**
 * MD054 - Link and image style
 */
export const linkImageStyleRule: RuleModule = {
  meta: {
    docs: 'Link and image style should be consistent',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    const options = (ctx.options as { style?: 'inline' | 'reference' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    // For `consistent` mode, use the MAJORITY style as the target, not the
    // first-detected one. Real READMEs commonly start with 2–3 reference-
    // style badges and continue with dozens of inline prose links —
    // first-detected would flag the inline majority, which is the wrong
    // direction. Majority makes the minority outliers stand out, which is
    // the more useful signal AND matches what an auto-fix can actually
    // resolve.
    let target: 'inline' | 'reference' | null = style === 'consistent' ? null : style
    if (target === null) {
      let inlineCount = 0
      let refCount = 0
      let inHtmlCommentScan = false
      for (let i = 0; i < lines.length; i++) {
        if (inCode.has(i))
          continue
        const line = lines[i]
        if (line.includes('<!--')) inHtmlCommentScan = true
        if (line.includes('-->')) { inHtmlCommentScan = false; continue }
        if (inHtmlCommentScan)
          continue
        if (/^\s*\[(?:[^\]]+)\]:\s*\S+/.test(line))
          continue
        const scrubbed = stripInlineCode(line)
        inlineCount += (scrubbed.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
        refCount += (scrubbed.match(/\[[^\]]+\]\[(?:[^\]]*)\]/g) || []).length
      }
      // Tie or no links → default to inline (the more common style in
      // most projects, and the only direction we can auto-fix).
      target = refCount > inlineCount ? 'reference' : 'inline'
    }

    let inHtmlComment = false

    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const line = lines[i]

      if (line.includes('<!--'))
        inHtmlComment = true
      if (line.includes('-->')) {
        inHtmlComment = false
        continue
      }
      if (inHtmlComment)
        continue

      if (line.match(/^\[(?:[^\]]+)\]:\s*\S+/))
        continue

      const scrubbed = stripInlineCode(line)

      const inlineMatches = scrubbed.matchAll(/\[[^\]]+\]\([^)]+\)/g)
      for (const match of inlineMatches) {
        if (target === 'reference') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/link-image-style',
            message: style === 'consistent'
              ? 'Link style should be consistent throughout document'
              : 'Expected reference style link',
            severity: style === 'consistent' ? 'warning' : 'error',
          })
        }
      }

      const refMatches = scrubbed.matchAll(/\[[^\]]+\]\[(?:[^\]]+)\]/g)
      for (const match of refMatches) {
        if (target === 'inline') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/link-image-style',
            message: style === 'consistent'
              ? 'Link style should be consistent throughout document'
              : 'Expected inline style link',
            severity: style === 'consistent' ? 'warning' : 'error',
          })
        }
      }
    }

    return issues
  },

  /**
   * Auto-fix MD054 by collapsing reference-style links/images into the
   * inline form when the document's detected (or configured) style is
   * `inline`. Resolves each `[text][label]` (and the collapsed
   * `[text][]`) by looking up the matching `[label]: url` definition
   * and rewriting to `[text](url)`. Image variants `![alt][label]`
   * are handled the same way.
   *
   * The reference DEFINITIONS themselves are left in place — the
   * `link-image-reference-definitions` rule (MD053) reports unused
   * defs, and removing them automatically would conflict with cases
   * where some references survive (e.g. style=reference users).
   *
   * The inverse direction (inline → reference) is not auto-fixed
   * because it requires generating unique labels and emitting new
   * definition blocks, which is hard to do without surprising the
   * author. Users who want that style can run a manual transform.
   */
  fix: (text, ctx) => {
    const options = (ctx.options as { style?: 'inline' | 'reference' | 'consistent' }) || {}
    const style = options.style || 'consistent'
    const lines = text.split(/\r?\n/)
    const inCode = getCodeBlockLines(lines)

    // Collect reference definitions: `[label]: url "optional title"`.
    const defs = new Map<string, { url: string, title?: string }>()
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const m = lines[i].match(/^\s*\[([^\]]+)\]:\s*(\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/)
      if (m) {
        const label = m[1].toLowerCase()
        const url = m[2]
        const title = m[3] ?? m[4] ?? m[5]
        if (!defs.has(label))
          defs.set(label, { url, title })
      }
    }
    if (defs.size === 0)
      return text

    // Determine target style — match the check function's majority logic.
    let target: 'inline' | 'reference' = style === 'reference' ? 'reference' : 'inline'
    if (style === 'consistent') {
      let inlineCount = 0
      let refCount = 0
      for (let i = 0; i < lines.length; i++) {
        if (inCode.has(i))
          continue
        const line = lines[i]
        if (/^\s*\[(?:[^\]]+)\]:\s*\S+/.test(line))
          continue
        const scrubbed = stripInlineCode(line)
        inlineCount += (scrubbed.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
        refCount += (scrubbed.match(/\[[^\]]+\]\[(?:[^\]]*)\]/g) || []).length
      }
      target = refCount > inlineCount ? 'reference' : 'inline'
    }

    // We only auto-fix the reference → inline direction (see fix doc).
    if (target !== 'inline')
      return text

    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (inCode.has(i))
        continue
      const original = lines[i]
      // Don't rewrite definition lines.
      if (/^\s*\[(?:[^\]]+)\]:\s*\S+/.test(original))
        continue
      // Replace `[text][label]`, `![alt][label]`, `[text][]`, `![alt][]`.
      // Real-world badges nest these — `[![alt][src]][href]` — so an
      // inside-out pass is needed: keep rewriting until the line stops
      // changing or we hit the safety cap. The simple bracket regex
      // can't match `[text][label]` when `text` itself contains `]`,
      // which is what happens once we've resolved the inner image.
      let rewritten = original
      for (let pass = 0; pass < 8; pass++) {
        const next = rewritten.replace(
          /(!?)\[((?:[^[\]]|\[[^\]]*\]\([^)]*\))+)\]\[([^\]]*)\]/g,
          (whole, bang: string, textPart: string, labelPart: string) => {
            const labelKey = (labelPart.trim() === '' ? textPart : labelPart).toLowerCase()
            const def = defs.get(labelKey)
            if (!def)
              return whole
            const titlePart = def.title ? ` "${def.title}"` : ''
            return `${bang}[${textPart}](${def.url}${titlePart})`
          },
        )
        if (next === rewritten)
          break
        rewritten = next
      }
      if (rewritten !== original) {
        lines[i] = rewritten
        changed = true
      }
    }
    return changed ? lines.join('\n') : text
  },
}

/**
 * Replace the contents of every inline code span (``` `...` ```) with
 * spaces so subsequent regexes don't match anything inside a code
 * segment. Spaces keep column positions stable so line/col reports in
 * outer matches stay accurate.
 */
function stripInlineCode(line: string): string {
  // Match `...`, ``...`` and longer runs. Non-greedy body.
  return line.replace(/(`+)([^`]+?)\1/g, (whole) => ' '.repeat(whole.length))
}
