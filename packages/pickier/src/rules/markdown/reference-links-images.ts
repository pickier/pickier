import type { LintIssue, RuleModule } from '../../types'

/**
 * MD052 - Reference links and images should use a label that is defined
 */
export const referenceLinksImagesRule: RuleModule = {
  meta: {
    docs: 'Reference links and images should use defined labels',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    // Collect all reference definitions [label]: url
    const definitions = new Set<string>()

    for (const line of lines) {
      const defMatch = line.match(/^\[([^\]]+)\]:\s*\S+/)
      if (defMatch) {
        definitions.add(defMatch[1].toLowerCase())
      }
    }

    let inFence = false
    let inHtmlComment = false

    // Check for reference links and images
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Track HTML comments (multi-line)
      if (line.includes('<!--'))
        inHtmlComment = true
      if (line.includes('-->')) {
        inHtmlComment = false
        continue
      }
      if (inHtmlComment)
        continue

      // Skip definition lines
      if (/^\[([^\]]+)\]:\s*\S+/.test(line))
        continue

      // Strip inline code spans before checking
      let stripped = line.replace(/`[^`]+`/g, m => ' '.repeat(m.length))

      // Strip inline links [text](url) and images ![alt](url) to avoid matching
      // nested brackets inside them (e.g., [renovate[bot]](url) contains [bot])
      stripped = stripped.replace(/!?\[[^\]]*\]\([^)]*\)/g, m => ' '.repeat(m.length))

      // Find reference links [text][label] or [label]
      const linkMatches = stripped.matchAll(/\[([^\]]+)\](?:\[([^\]]+)\])?(?!\()/g)

      for (const match of linkMatches) {
        const label = (match[2] || match[1]).toLowerCase()

        // Skip checkbox patterns [x], [ ], [X]
        if (/^[xX ]$/.test(label))
          continue

        // Skip array/tuple literals: ['value', ...] or ["value", ...] or [identifier, ...]
        // These appear in docs as inline code examples outside of fences
        if (/^['"]/.test(label.trim()) || /,/.test(label))
          continue

        // Skip shell/script bracket expressions like [ -n "$var" ]
        if (/^-[a-z]\s/.test(label.trim()))
          continue

        if (!definitions.has(label)) {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/reference-links-images',
            message: `Reference link '[${label}]' is not defined`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
