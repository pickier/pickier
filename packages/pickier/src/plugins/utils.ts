import type { LintIssue, RuleContext, RuleModule } from '../types'

const CODE_EXTS = /\.(?:ts|js|tsx|jsx|mts|mjs|cts|cjs)$/

export function codeOnly(rule: RuleModule): RuleModule {
  return {
    meta: rule.meta,
    check: (content: string, context: RuleContext): LintIssue[] => {
      if (!CODE_EXTS.test(context.filePath))
        return []
      return rule.check(content, context)
    },
    fix: rule.fix
      ? (content: string, context: RuleContext): string => {
          if (!CODE_EXTS.test(context.filePath))
            return content
          return rule.fix!(content, context)
        }
      : undefined,
  }
}

const SHELL_EXTS = /\.(?:sh|bash|zsh|ksh|dash)$/
const SHELL_SHEBANG = /^#!\s*(?:\/usr\/bin\/env\s+)?(?:ba|z|k|da)?sh\b/

export function shellOnly(rule: RuleModule): RuleModule {
  return {
    meta: rule.meta,
    check: (content: string, context: RuleContext): LintIssue[] => {
      if (!SHELL_EXTS.test(context.filePath) && !SHELL_SHEBANG.test(content))
        return []
      return rule.check(content, context)
    },
    fix: rule.fix
      ? (content: string, context: RuleContext): string => {
          if (!SHELL_EXTS.test(context.filePath) && !SHELL_SHEBANG.test(content))
            return content
          return rule.fix!(content, context)
        }
      : undefined,
  }
}

const PACKAGE_JSON_RE = /(?:^|[/\\])package\.json$/

export function packageJsonOnly(rule: RuleModule): RuleModule {
  return {
    meta: rule.meta,
    check: (content: string, context: RuleContext): LintIssue[] => {
      if (!PACKAGE_JSON_RE.test(context.filePath))
        return []
      return rule.check(content, context)
    },
    fix: rule.fix
      ? (content: string, context: RuleContext): string => {
          if (!PACKAGE_JSON_RE.test(context.filePath))
            return content
          return rule.fix!(content, context)
        }
      : undefined,
  }
}
