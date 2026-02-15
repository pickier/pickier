import type { LintIssue, RuleModule } from '../../types'

/**
 * MD049 - Emphasis style
 */
export const emphasisStyleRule: RuleModule = {
  meta: {
    docs: 'Emphasis style should be consistent (asterisk or underscore)',
  },
  check: (text, ctx) => {
    const issues: LintIssue[] = []
    const lines = text.split(/\r?\n/)

    const options = (ctx.options as { style?: 'asterisk' | 'underscore' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    let detectedStyle: 'asterisk' | 'underscore' | null = null
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track fenced code blocks
      if (/^(?:`{3,}|~{3,})/.test(line.trim())) {
        inFence = !inFence
        continue
      }
      if (inFence)
        continue

      // Strip inline code spans to avoid matching emphasis markers inside code
      const stripped = line.replace(/``[^`]+``/g, '  ').replace(/`[^`]+`/g, ' ')

      // Find single asterisk emphasis (not double **)
      const asteriskMatches = stripped.matchAll(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g)

      for (const match of asteriskMatches) {
        if (style === 'underscore') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/emphasis-style',
            message: 'Expected underscore (_) for emphasis',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'asterisk'
          }
          else if (detectedStyle === 'underscore') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: match.index! + 1,
              ruleId: 'markdown/emphasis-style',
              message: 'Emphasis style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }

      // Find single underscore emphasis (not double __)
      const underscoreMatches = stripped.matchAll(/(?<!_)_(?!_)([^_]+)_(?!_)/g)

      for (const match of underscoreMatches) {
        if (style === 'asterisk') {
          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: match.index! + 1,
            ruleId: 'markdown/emphasis-style',
            message: 'Expected asterisk (*) for emphasis',
            severity: 'error',
          })
        }
        else if (style === 'consistent') {
          if (detectedStyle === null) {
            detectedStyle = 'underscore'
          }
          else if (detectedStyle === 'asterisk') {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: match.index! + 1,
              ruleId: 'markdown/emphasis-style',
              message: 'Emphasis style should be consistent throughout document',
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
  fix: (text, ctx) => {
    const options = (ctx.options as { style?: 'asterisk' | 'underscore' | 'consistent' }) || {}
    const style = options.style || 'consistent'

    // Determine target style
    let targetStyle: 'asterisk' | 'underscore' = 'asterisk'
    if (style === 'asterisk') {
      targetStyle = 'asterisk'
    }
    else if (style === 'underscore') {
      targetStyle = 'underscore'
    }
    else if (style === 'consistent') {
      // Find first emphasis marker
      const asteriskMatch = text.match(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/)
      const underscoreMatch = text.match(/(?<!_)_(?!_)([^_]+)_(?!_)/)

      if (asteriskMatch && (!underscoreMatch || asteriskMatch.index! < underscoreMatch.index!)) {
        targetStyle = 'asterisk'
      }
      else if (underscoreMatch) {
        targetStyle = 'underscore'
      }
    }

    let fixed = text
    if (targetStyle === 'asterisk') {
      // Convert underscores to asterisks
      fixed = fixed.replace(/(?<!_)_(?!_)([^_]+)_(?!_)/g, '*$1*')
    }
    else {
      // Convert asterisks to underscores
      fixed = fixed.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '_$1_')
    }

    return fixed
  },
}
