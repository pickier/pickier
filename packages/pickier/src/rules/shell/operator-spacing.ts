import type { RuleModule } from '../../types'

/**
 * Enforce spaces inside test bracket expressions [ ] and [[ ]].
 * Missing spaces cause syntax errors or incorrect behavior.
 */
export const operatorSpacingRule: RuleModule = {
  meta: {
    docs: 'Enforce spaces inside [ ] and [[ ]] test expressions',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    let inHeredoc = false
    let heredocDelim = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (inHeredoc) {
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?/)
      if (heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch[1]
      }

      const trimmed = line.replace(/^\s+/, '')
      if (trimmed.startsWith('#'))
        continue

      // Check [[ without space after
      const dblOpenNoSpace = line.match(/\[\[(?!\s)/)
      if (dblOpenNoSpace) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: (dblOpenNoSpace.index || 0) + 1,
          ruleId: 'shell/operator-spacing',
          message: 'Missing space after [[',
          severity: 'warning',
        })
      }

      // Check ]] without space before
      const dblCloseNoSpace = line.match(/(?<!\s)\]\]/)
      if (dblCloseNoSpace) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: (dblCloseNoSpace.index || 0) + 1,
          ruleId: 'shell/operator-spacing',
          message: 'Missing space before ]]',
          severity: 'warning',
        })
      }

      // Check single [ without space after (but not [[ )
      const sglOpenNoSpace = line.match(/(?<!\[)\[(?!\[)(?!\s)/)
      if (sglOpenNoSpace) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: (sglOpenNoSpace.index || 0) + 1,
          ruleId: 'shell/operator-spacing',
          message: 'Missing space after [',
          severity: 'warning',
        })
      }

      // Check single ] without space before (but not ]] )
      const sglCloseNoSpace = line.match(/(?<!\s)(?<!\])\](?!\])/)
      if (sglCloseNoSpace) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: (sglCloseNoSpace.index || 0) + 1,
          ruleId: 'shell/operator-spacing',
          message: 'Missing space before ]',
          severity: 'warning',
        })
      }
    }
    return issues
  },
  fix(content) {
    const lines = content.split(/\r?\n/)
    const result: string[] = []

    for (const line of lines) {
      let fixed = line
      // Fix [[ spacing
      fixed = fixed.replace(/\[\[(?!\s)/g, '[[ ')
      fixed = fixed.replace(/(?<!\s)\]\]/g, ' ]]')
      // Fix [ ] spacing (careful not to affect [[ ]])
      fixed = fixed.replace(/(?<!\[)\[(?!\[)(?!\s)/g, '[ ')
      fixed = fixed.replace(/(?<!\s)(?<!\])\](?!\])/g, ' ]')
      result.push(fixed)
    }
    return result.join('\n')
  },
}
