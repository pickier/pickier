import type { RuleModule } from '../../types'

/**
 * Enforce consistent indentation in shell scripts.
 * Default is 2 spaces per level, matching the project's code style.
 */

// Lines that increase nesting level — requires case context tracking
function shouldIncreaseAfter(trimmed: string, inCase: boolean): boolean {
  // then/do/else on their own line
  if (/^then\b/.test(trimmed) || /^do\b/.test(trimmed) || /^else\b/.test(trimmed))
    return true
  // if ... then on same line
  if (/^if\b/.test(trimmed) && /\bthen\s*$/.test(trimmed))
    return true
  // elif ... then on same line
  if (/^elif\b/.test(trimmed) && /\bthen\s*$/.test(trimmed))
    return true
  // while/for/until ... do on same line
  if (/^(?:while|for|until)\b/.test(trimmed) && /\bdo\s*$/.test(trimmed))
    return true
  // case ... in
  if (/^case\b/.test(trimmed) && /\bin\s*$/.test(trimmed))
    return true
  // case pattern ) — only inside case blocks, and not command substitution
  if (inCase && /\)\s*$/.test(trimmed) && !/\$\(/.test(trimmed) && !/^\s*\(/.test(trimmed) && !trimmed.startsWith('#'))
    return true
  // opening brace
  if (/\{\s*$/.test(trimmed) && !trimmed.startsWith('#'))
    return true
  return false
}

// Lines that decrease nesting level (checked BEFORE indenting)
function shouldDecreaseBefore(trimmed: string): boolean {
  return /^(?:fi|done|esac|elif|else)\b/.test(trimmed)
    || /^\}/.test(trimmed)
    || /^;[;&]\s*$/.test(trimmed)
}

export const indentRule: RuleModule = {
  meta: {
    docs: 'Enforce consistent indentation in shell scripts',
    recommended: true,
  },
  check(content, ctx) {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = content.split(/\r?\n/)
    const indentSize = ctx.config.format.indent || 2
    let expectedLevel = 0
    let inHeredoc = false
    let heredocDelim = ''
    let inCase = false
    let caseDepth = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip empty lines
      if (/^\s*$/.test(line)) continue

      // Heredoc pass-through
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

      // Skip shebang
      if (i === 0 && trimmed.startsWith('#!')) continue

      // Track case blocks
      if (/^case\b/.test(trimmed) && /\bin\s*$/.test(trimmed)) { caseDepth++; inCase = true }
      if (/^esac\b/.test(trimmed)) { caseDepth = Math.max(0, caseDepth - 1); if (caseDepth === 0) inCase = false }

      // Decrease before current line if needed
      if (shouldDecreaseBefore(trimmed))
        expectedLevel = Math.max(0, expectedLevel - 1)

      // Measure actual indentation
      let actualSpaces = 0
      for (let j = 0; j < line.length; j++) {
        if (line[j] === ' ') actualSpaces++
        else if (line[j] === '\t') actualSpaces += indentSize
        else break
      }

      const expectedSpaces = expectedLevel * indentSize

      // Report if indentation doesn't match (skip comments that may float)
      if (actualSpaces !== expectedSpaces && !trimmed.startsWith('#')) {
        issues.push({
          filePath: ctx.filePath,
          line: i + 1,
          column: 1,
          ruleId: 'shell/indent',
          message: `Expected ${expectedSpaces} spaces of indentation, found ${actualSpaces}`,
          severity: 'warning',
        })
      }

      // Increase after current line if needed
      if (shouldIncreaseAfter(trimmed, inCase))
        expectedLevel++
    }
    return issues
  },
  fix(content, ctx) {
    const lines = content.split(/\r?\n/)
    const indentSize = ctx.config.format.indent || 2
    const useTab = ctx.config.format.indentStyle === 'tabs'
    const result: string[] = []
    let level = 0
    let inHeredoc = false
    let heredocDelim = ''
    let inCase = false
    let caseDepth = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (/^\s*$/.test(line)) { result.push(''); continue }

      if (inHeredoc) {
        result.push(line)
        if (line.trim() === heredocDelim)
          inHeredoc = false
        continue
      }
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?/)
      if (heredocMatch) {
        inHeredoc = true
        heredocDelim = heredocMatch[1]
      }

      const trimmed = line.replace(/^\s+/, '').trimEnd()

      // Shebang
      if (i === 0 && trimmed.startsWith('#!')) { result.push(trimmed); continue }

      // Track case blocks
      if (/^case\b/.test(trimmed) && /\bin\s*$/.test(trimmed)) { caseDepth++; inCase = true }
      if (/^esac\b/.test(trimmed)) { caseDepth = Math.max(0, caseDepth - 1); if (caseDepth === 0) inCase = false }

      if (shouldDecreaseBefore(trimmed))
        level = Math.max(0, level - 1)

      const indent = useTab ? '\t'.repeat(level) : ' '.repeat(level * indentSize)
      result.push(indent + trimmed)

      if (shouldIncreaseAfter(trimmed, inCase))
        level++
    }
    return result.join('\n')
  },
}
