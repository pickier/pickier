import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Detect class member starts: methods, properties, getters, setters, static members
const CLASS_MEMBER_RE = /^\s*(?:public|private|protected|static|readonly|abstract|override|async|get|set|\*|#|[a-zA-Z_$])/

export const linesBetweenClassMembersRule: RuleModule = {
  meta: {
    docs: 'Require blank line between class members',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    let inClass = false
    let braceDepth = 0
    let classDepth = 0
    let prevMemberEndLine = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Track class entry
      if (trimmed.match(/\bclass\b/) && (trimmed.includes('{') || (i + 1 < lines.length && lines[i + 1].trim() === '{'))) {
        inClass = true
        classDepth = braceDepth + 1
      }

      const prevBraceDepth = braceDepth

      for (const ch of trimmed) {
        if (ch === '{')
          braceDepth++
        if (ch === '}')
          braceDepth--
      }

      // Check if we left the class
      if (inClass && braceDepth < classDepth) {
        inClass = false
        prevMemberEndLine = -1
        continue
      }

      if (!inClass)
        continue

      // Track when a member's closing brace returns to class level
      if (prevBraceDepth > classDepth && braceDepth === classDepth && trimmed.endsWith('}')) {
        prevMemberEndLine = i
        continue
      }

      // At class level, detect new member starts
      if (prevBraceDepth === classDepth) {
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed === '}')
          continue

        if (CLASS_MEMBER_RE.test(trimmed)) {
          if (prevMemberEndLine !== -1 && i === prevMemberEndLine + 1) {
            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: 1,
              ruleId: 'style/lines-between-class-members',
              message: 'Missing blank line between class members',
              severity: 'warning',
            })
          }
          // For single-line members (no opening brace), track end here
          if (!trimmed.endsWith('{')) {
            prevMemberEndLine = i
          }
        }
      }
    }

    return issues
  },
  fix(content: string, _context: RuleContext): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    let inClass = false
    let braceDepth = 0
    let classDepth = 0
    let prevMemberEndLine = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (trimmed.match(/\bclass\b/) && (trimmed.includes('{') || (i + 1 < lines.length && lines[i + 1].trim() === '{'))) {
        inClass = true
        classDepth = braceDepth + 1
      }

      const prevBraceDepth = braceDepth
      for (const ch of trimmed) {
        if (ch === '{')
          braceDepth++
        if (ch === '}')
          braceDepth--
      }

      if (inClass && braceDepth < classDepth) {
        inClass = false
        prevMemberEndLine = -1
        result.push(line)
        continue
      }

      if (inClass && prevBraceDepth > classDepth && braceDepth === classDepth && trimmed.endsWith('}')) {
        prevMemberEndLine = i
        result.push(line)
        continue
      }

      if (inClass && prevBraceDepth === classDepth && trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*') && trimmed !== '}' && CLASS_MEMBER_RE.test(trimmed)) {
        if (prevMemberEndLine !== -1 && i === prevMemberEndLine + 1) {
          result.push('')
        }
        if (!trimmed.endsWith('{')) {
          prevMemberEndLine = i
        }
      }

      result.push(line)
    }

    return result.join('\n')
  },
}
