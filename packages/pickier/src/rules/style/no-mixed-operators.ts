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

// Operator groups that should not be mixed without parentheses
const LOGICAL_AND_RE = /&&/g
const LOGICAL_OR_RE = /\|\|/g
const NULLISH_RE = /\?\?/g
const BITWISE_AND_RE = /(?<![&])&(?![&=])/g
const BITWISE_OR_RE = /(?<![|])\|(?![|=])/g
const BITWISE_XOR_RE = /\^(?!=)/g

interface OperatorMatch {
  op: string
  group: number
  index: number
}

function findOperators(line: string): OperatorMatch[] {
  const matches: OperatorMatch[] = []

  // Group 0: && (logical AND)
  LOGICAL_AND_RE.lastIndex = 0
  let m
  while ((m = LOGICAL_AND_RE.exec(line)) !== null) {
    if (!isInStringOrComment(line, m.index))
      matches.push({ op: '&&', group: 0, index: m.index })
  }

  // Group 1: || (logical OR)
  LOGICAL_OR_RE.lastIndex = 0
  while ((m = LOGICAL_OR_RE.exec(line)) !== null) {
    if (!isInStringOrComment(line, m.index))
      matches.push({ op: '||', group: 1, index: m.index })
  }

  // Group 2: ?? (nullish coalescing)
  NULLISH_RE.lastIndex = 0
  while ((m = NULLISH_RE.exec(line)) !== null) {
    if (!isInStringOrComment(line, m.index))
      matches.push({ op: '??', group: 2, index: m.index })
  }

  // Group 3: & (bitwise AND)
  BITWISE_AND_RE.lastIndex = 0
  while ((m = BITWISE_AND_RE.exec(line)) !== null) {
    if (!isInStringOrComment(line, m.index))
      matches.push({ op: '&', group: 3, index: m.index })
  }

  // Group 4: | (bitwise OR)
  BITWISE_OR_RE.lastIndex = 0
  while ((m = BITWISE_OR_RE.exec(line)) !== null) {
    if (!isInStringOrComment(line, m.index))
      matches.push({ op: '|', group: 4, index: m.index })
  }

  // Group 5: ^ (bitwise XOR)
  BITWISE_XOR_RE.lastIndex = 0
  while ((m = BITWISE_XOR_RE.exec(line)) !== null) {
    if (!isInStringOrComment(line, m.index))
      matches.push({ op: '^', group: 5, index: m.index })
  }

  return matches.sort((a, b) => a.index - b.index)
}

// Check if operators at given positions are separated by parentheses
function areParenthesized(line: string, ops: OperatorMatch[]): boolean {
  if (ops.length < 2)
    return true

  // Track parenthesis depth at each operator
  // If all operators of the same group are at a different paren depth than the other group,
  // they are properly parenthesized
  const depths: number[] = []

  for (const op of ops) {
    let depth = 0
    for (let i = 0; i < op.index; i++) {
      if (line[i] === '(')
        depth++
      else if (line[i] === ')')
        depth--
    }
    depths.push(depth)
  }

  // Group operators by their group
  const groupDepths = new Map<number, number[]>()
  for (let i = 0; i < ops.length; i++) {
    const group = ops[i].group
    if (!groupDepths.has(group))
      groupDepths.set(group, [])
    groupDepths.get(group)!.push(depths[i])
  }

  // If there are exactly 2 groups, check if one group is nested deeper than the other
  const groups = [...groupDepths.entries()]
  if (groups.length === 2) {
    const [, depths1] = groups[0]
    const [, depths2] = groups[1]
    const min1 = Math.min(...depths1)
    const max1 = Math.max(...depths1)
    const min2 = Math.min(...depths2)
    const max2 = Math.max(...depths2)
    // If one group is entirely deeper than the other, they are properly grouped
    if (min1 > max2 || min2 > max1)
      return true
  }

  return false
}

const MIXED_LOGICAL_GROUPS = [
  { groups: [0, 1], label: '&& and ||' }, // && mixed with ||
  { groups: [0, 2], label: '&& and ??' }, // && mixed with ??
  { groups: [1, 2], label: '|| and ??' }, // || mixed with ??
  { groups: [3, 4], label: '& and |' }, // bitwise & mixed with |
  { groups: [3, 5], label: '& and ^' }, // bitwise & mixed with ^
  { groups: [4, 5], label: '| and ^' }, // bitwise | mixed with ^
]

export const noMixedOperatorsRule: RuleModule = {
  meta: {
    docs: 'Disallow mixed logical/bitwise operators without parentheses',
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

      const operators = findOperators(line)
      if (operators.length < 2)
        continue

      const presentGroups = new Set(operators.map(op => op.group))

      for (const combo of MIXED_LOGICAL_GROUPS) {
        if (presentGroups.has(combo.groups[0]) && presentGroups.has(combo.groups[1])) {
          // Found mixed operators - check if they're properly parenthesized
          const relevantOps = operators.filter(
            op => op.group === combo.groups[0] || op.group === combo.groups[1],
          )

          if (!areParenthesized(line, relevantOps)) {
            // Report at the position of the first operator from the second group
            const secondGroupOp = relevantOps.find(op => op.group === combo.groups[1])
            if (secondGroupOp) {
              issues.push({
                filePath: context.filePath,
                line: i + 1,
                column: secondGroupOp.index + 1,
                ruleId: 'style/no-mixed-operators',
                message: `Unexpected mix of ${combo.label} without parentheses`,
                severity: 'warning',
              })
            }
          }
        }
      }
    }

    return issues
  },
  // No fixer: ambiguous which grouping the user intends
}
