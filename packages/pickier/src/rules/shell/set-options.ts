import type { RuleModule } from '../../types'

/**
 * Recommend using `set -euo pipefail` for safer script execution.
 * - set -e: Exit on error
 * - set -u: Error on undefined variables
 * - set -o pipefail: Pipe failures propagate
 */
export const setOptionsRule: RuleModule = {
  meta: {
    docs: 'Recommend set -euo pipefail for safer script execution',
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)

    let hasSetE = false
    let hasSetU = false
    let hasSetPipefail = false
    let shebangLine = -1
    let hasContent = false

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].replace(/^\s+/, '')

      if (i === 0 && trimmed.startsWith('#!')) {
        shebangLine = i
        continue
      }
      if (trimmed.startsWith('#')) continue
      if (trimmed === '') continue

      hasContent = true

      // Check for set flag groups: -e, -eu, -euo, etc. (flag chars directly after -)
      if (/\bset\s+-\w*e/.test(trimmed)) hasSetE = true
      if (/\bset\s+-\w*u/.test(trimmed)) hasSetU = true
      if (/\bset\s+.*-o\s+pipefail/.test(trimmed)) hasSetPipefail = true
      // Combined: set -euo pipefail
      if (/\bset\s+-euo\s+pipefail/.test(trimmed)) {
        hasSetE = true
        hasSetU = true
        hasSetPipefail = true
      }
    }

    // Skip empty files with no meaningful content
    if (!hasContent) return issues

    const missing: string[] = []
    if (!hasSetE) missing.push('-e')
    if (!hasSetU) missing.push('-u')
    if (!hasSetPipefail) missing.push('-o pipefail')

    if (missing.length > 0) {
      issues.push({
        filePath: ctx.filePath,
        line: shebangLine >= 0 ? shebangLine + 2 : 1,
        column: 1,
        ruleId: 'shell/set-options',
        message: `Missing shell safety options: set ${missing.join(' ')}`,
        severity: 'warning',
        help: 'Add `set -euo pipefail` near the top of the script for safer execution',
      })
    }

    return issues
  },
}
