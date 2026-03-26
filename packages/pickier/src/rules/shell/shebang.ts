import type { RuleModule } from '../../types'

/**
 * Ensure shell scripts have a proper shebang line.
 * The shebang must be the very first line and use a recognized shell interpreter.
 */
const VALID_SHEBANGS = /^#!\s*(?:\/usr\/bin\/env\s+(?:ba|z|k|da)?sh|\/bin\/(?:ba|z|k|da)?sh|\/usr\/bin\/(?:ba|z|k|da)?sh)\b/

export const shebangRule: RuleModule = {
  meta: {
    docs: 'Ensure shell scripts have a proper shebang line',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)

    if (lines.length === 0) return issues

    const firstLine = lines[0]

    // Skip empty files
    if (lines.every(l => l.trim() === '')) return issues

    // Check if first line is a shebang
    if (!firstLine.startsWith('#!')) {
      issues.push({
        filePath: ctx.filePath,
        line: 1,
        column: 1,
        ruleId: 'shell/shebang',
        message: 'Missing shebang line — shell scripts should start with #!/usr/bin/env bash (or similar)',
        severity: 'warning',
        help: 'Add #!/usr/bin/env bash as the first line',
      })
      return issues
    }

    // Check if shebang is valid
    if (!VALID_SHEBANGS.test(firstLine)) {
      issues.push({
        filePath: ctx.filePath,
        line: 1,
        column: 1,
        ruleId: 'shell/shebang',
        message: `Invalid shebang: ${firstLine} — use #!/usr/bin/env bash or #!/bin/sh`,
        severity: 'warning',
        help: 'Use #!/usr/bin/env bash for portability or #!/bin/sh for POSIX scripts',
      })
    }

    return issues
  },
}
