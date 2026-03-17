import type { LintIssue, RuleContext, RuleModule } from '../../types'

// Match `new Identifier` not followed by ( or preceded by keyword patterns
// We want to catch `new Foo` but not `new Foo(` or `new Foo<T>(`
const NEW_WITHOUT_PARENS_RE = new RegExp(
  '\\bnew\\s+([A-Z][a-zA-Z0-9_$.]+)(?![a-zA-Z0-9_$])(?:\\s*<[^>]*>)?\\s*(?=[^(' + ';' + '\\n]|$)',
  'g',
)

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

export const newParensRule: RuleModule = {
  meta: {
    docs: 'Require parentheses when invoking a constructor with no arguments',
    recommended: true,
  },
  check(content: string, context: RuleContext): LintIssue[] {
    const issues: LintIssue[] = []
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
        continue

      // Find all `new ClassName` patterns
      let match
      NEW_WITHOUT_PARENS_RE.lastIndex = 0

      while ((match = NEW_WITHOUT_PARENS_RE.exec(line)) !== null) {
        if (isInStringOrComment(line, match.index))
          continue

        // Check what follows the constructor name
        const afterMatch = line.slice(match.index + match[0].length)
        // If immediately followed by (, it has parens - skip
        if (afterMatch.startsWith('('))
          continue
        // If it's part of a longer expression like `new.target`, skip
        if (match[0].includes('new.'))
          continue

        issues.push({
          filePath: context.filePath,
          line: i + 1,
          column: match.index + 1,
          ruleId: 'style/new-parens',
          message: `Missing parentheses invoking constructor '${match[1]}'`,
          severity: 'warning',
          help: 'Add () after the constructor name.',
        })
      }
    }

    return issues
  },
  fix(content: string): string {
    // Add () after `new Constructor` when missing parens
    return content.replace(
      /\bnew\s+([A-Z][a-zA-Z0-9_$.]+)(?![a-zA-Z0-9_$])(\s*<[^>]*>)?\s*(?=[^(]|$)/g,
      (match, name, generics) => {
        // Check if already has parens
        const rest = match.slice(match.indexOf(name) + name.length + (generics?.length || 0))
        if (rest.trim().startsWith('('))
          return match
        return `new ${name}${generics || ''}()`
      },
    )
  },
}
