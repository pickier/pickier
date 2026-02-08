import type { LintIssue, RuleModule } from '../../types'

/**
 * MD025 - Multiple top-level headings in the same document
 */
export const singleTitleRule: RuleModule = {
  meta: {
    docs: 'Document should have only one top-level heading (h1)',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)
    let firstH1Line = -1
    let inFencedCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

      // Track fenced code blocks to avoid false positives on comments like `# comment`
      if (/^(`{3,}|~{3,})/.test(line.trim())) {
        inFencedCodeBlock = !inFencedCodeBlock
        continue
      }

      if (inFencedCodeBlock)
        continue

      let isH1 = false

      // Check for ATX style h1
      if (/^#\s/.test(line)) {
        isH1 = true
      }

      // Check for Setext style h1 (underlined with =)
      if (/^=+\s*$/.test(nextLine) && line.trim().length > 0) {
        isH1 = true
      }

      if (isH1) {
        if (firstH1Line === -1) {
          firstH1Line = i + 1
        }
        else {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: 1,
            ruleId: 'markdown/single-title',
            message: `Multiple top-level headings in the same document (first h1 on line ${firstH1Line})`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
