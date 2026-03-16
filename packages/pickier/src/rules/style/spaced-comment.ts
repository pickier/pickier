import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match // without space after (but allow ///, //! for triple-slash directives and shebang-like)
const _LINE_COMMENT_NO_SPACE = /\/\/([^\s/!])/
// Match /* without space after (but allow /** for JSDoc)
const _BLOCK_COMMENT_NO_SPACE = /\/\*([^\s*!])/

export const spacedCommentRule: RuleModule = {
  meta: {
    docs: 'Require space after // and /* in comments',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const _trimmed = line.trim()

      // Check line comments: // without space
      const lineCommentIdx = line.indexOf('//')
      if (lineCommentIdx !== -1) {
        // Ensure it's not inside a string
        const before = line.slice(0, lineCommentIdx)
        const singles = (before.match(/'/g) || []).length
        const doubles = (before.match(/"/g) || []).length
        const backticks = (before.match(/`/g) || []).length

        if (singles % 2 === 0 && doubles % 2 === 0 && backticks % 2 === 0) {
          // Check for URL patterns (http:// or https://)
          if (!before.match(/https?:$/)) {
            const afterSlashes = line.slice(lineCommentIdx + 2)
            // Allow ///, //!, and empty comments
            if (afterSlashes.length > 0 && afterSlashes[0] !== ' ' && afterSlashes[0] !== '\t' && afterSlashes[0] !== '/' && afterSlashes[0] !== '!') {
              issues.push({
                filePath: context.filePath,
                line: i + 1,
                column: lineCommentIdx + 3,
                ruleId: 'style/spaced-comment',
                message: 'Missing space after \'//\'',
                severity: 'warning',
                help: 'Add a space after // in comments.',
              })
            }
          }
        }
      }

      // Check block comments: /* without space (but not /**)
      const blockIdx = line.indexOf('/*')
      if (blockIdx !== -1 && line[blockIdx + 2] !== '*' && line[blockIdx + 2] !== '!') {
        const before = line.slice(0, blockIdx)
        const singles = (before.match(/'/g) || []).length
        const doubles = (before.match(/"/g) || []).length
        const backticks = (before.match(/`/g) || []).length

        if (singles % 2 === 0 && doubles % 2 === 0 && backticks % 2 === 0) {
          const afterSlashes = line.slice(blockIdx + 2)
          if (afterSlashes.length > 0 && afterSlashes[0] !== ' ' && afterSlashes[0] !== '\t' && afterSlashes[0] !== '\n') {
            issues.push({
              filePath: context.filePath,
              line: i + 1,
              column: blockIdx + 3,
              ruleId: 'style/spaced-comment',
              message: 'Missing space after \'/*\'',
              severity: 'warning',
              help: 'Add a space after /* in comments.',
            })
          }
        }
      }
    }

    return issues
  },
  fix(content: string): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      let fixed = line

      // Fix line comments: //word -> // word (but not ///, //!, or URLs)
      fixed = fixed.replace(/(\/\/)([^\s/!])/, '$1 $2')

      // Fix block comments: /*word -> /* word (but not /**, /*!)
      fixed = fixed.replace(/(\/\*)([^\s*!])/, '$1 $2')

      result.push(fixed)
    }

    return result.join('\n')
  },
}
