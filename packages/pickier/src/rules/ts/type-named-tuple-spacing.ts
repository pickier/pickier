import type { LintIssue, RuleContext, RuleModule } from '../../types'

function isInStringOrComment(line: string, index: number): boolean {
  const before = line.slice(0, index)
  if (before.includes('//'))
    return true
  const singles = (before.match(/'/g) || []).length
  const doubles = (before.match(/"/g) || []).length
  const backticks = (before.match(/`/g) || []).length
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

// Named tuple member without space after colon: [name:string]
// Matches identifier followed by colon and a type (without space after colon)
// The pattern looks inside square brackets for `identifier:Type` (no space after colon)
const _NAMED_TUPLE_NO_SPACE_RE = /\[\s*([a-zA-Z_$][a-zA-Z0-9_$?]*):(\S)/g

// Also handle multiple members: [name:string, age:number]
// We check each `identifier:Type` pair that lacks a space
const TUPLE_MEMBER_NO_SPACE_RE = /([a-zA-Z_$][a-zA-Z0-9_$?]*):(\S)/g

export const typeNamedTupleSpacingRule: RuleModule = {
  meta: {
    docs: 'Require space after colon in named tuple members',
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

      // Only check lines that appear to be in a type context with square brackets
      // Look for patterns like `type X = [name:string` or `[name:string,`
      // We need to find square bracket regions that contain named tuples
      const bracketRegions = findBracketRegions(line)

      for (const region of bracketRegions) {
        // Check if this looks like a named tuple (contains identifier:Type pattern)
        TUPLE_MEMBER_NO_SPACE_RE.lastIndex = 0
        let match
        while ((match = TUPLE_MEMBER_NO_SPACE_RE.exec(region.text)) !== null) {
          const absIdx = region.start + match.index
          const colonIdx = absIdx + match[1].length

          if (isInStringOrComment(line, colonIdx))
            continue

          // Make sure this looks like a type context (not a ternary, object literal, etc.)
          // Named tuples appear in type positions: after `=`, in function params typed as tuples, etc.
          // Heuristic: the line should contain `type ` or be inside a type annotation context
          if (!isLikelyTypeContext(line))
            continue

          issues.push({
            filePath: context.filePath,
            line: i + 1,
            column: colonIdx + 2,
            ruleId: 'ts/type-named-tuple-spacing',
            message: 'Missing space after colon in named tuple member',
            severity: 'warning',
          })
        }
      }
    }

    return issues
  },
  fix(content: string, _context: RuleContext): string {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        result.push(line)
        continue
      }

      if (!isLikelyTypeContext(line)) {
        result.push(line)
        continue
      }

      let fixed = line
      const bracketRegions = findBracketRegions(line)

      // Process regions from right to left so indices remain valid
      for (let r = bracketRegions.length - 1; r >= 0; r--) {
        const region = bracketRegions[r]
        // Fix colon spacing in named tuple members within this region
        const fixedRegion = region.text.replace(
          /([a-zA-Z_$][a-zA-Z0-9_$?]*):(\S)/g,
          '$1: $2',
        )
        if (fixedRegion !== region.text) {
          fixed = fixed.slice(0, region.start) + fixedRegion + fixed.slice(region.start + region.text.length)
        }
      }

      result.push(fixed)
    }

    return result.join('\n')
  },
}

interface BracketRegion {
  start: number
  text: string
}

function findBracketRegions(line: string): BracketRegion[] {
  const regions: BracketRegion[] = []
  let depth = 0
  let start = -1

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '[') {
      if (depth === 0)
        start = i
      depth++
    }
    else if (line[i] === ']') {
      depth--
      if (depth === 0 && start >= 0) {
        regions.push({
          start,
          text: line.slice(start, i + 1),
        })
        start = -1
      }
    }
  }

  return regions
}

function isLikelyTypeContext(line: string): boolean {
  const trimmed = line.trim()
  // Common type contexts: type declarations, function parameter types, return types, interface members
  return /\btype\s/.test(trimmed)
    || /:\s*\[/.test(trimmed)
    || /=\s*\[/.test(trimmed)
    || /\bas\s/.test(trimmed)
    || /<[^>]*\[/.test(trimmed)
    || /\bextends\s/.test(trimmed)
    || /\bimplements\s/.test(trimmed)
}
