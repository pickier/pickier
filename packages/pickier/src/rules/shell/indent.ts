import type { RuleModule } from '../../types'
import { ShellContinuation } from './_continuation'
import { shellSourceLines } from './_shared'

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
    const lines = shellSourceLines(content)
    const indentSize = ctx.config.format.indent || 2
    let expectedLevel = 0
    const continuation = new ShellContinuation()
    let inCase = false
    let caseDepth = 0

    for (let i = 0; i < lines.length; i++) {
      const source = lines[i]
      const line = source.text

      if (source.heredoc || /^\s*$/.test(line)) continue
      const trimmed = source.masked.trim()
      const flow = continuation.readMasked(trimmed, source.protectedEnd)

      // Skip shebang
      if (i === 0 && trimmed.startsWith('#!')) continue

      // Track case blocks
      if (/^case\b/.test(trimmed) && /\bin\s*$/.test(trimmed)) {
        caseDepth++
        inCase = true
      }
      if (/^esac\b/.test(trimmed)) {
        caseDepth = Math.max(0, caseDepth - 1)
        if (caseDepth === 0)
          inCase = false
      }

      // Decrease before current line if needed
      if (!flow.continuation && shouldDecreaseBefore(trimmed))
        expectedLevel = Math.max(0, expectedLevel - 1)

      // Measure actual indentation
      let actualSpaces = 0
      for (let j = 0; j < line.length; j++) {
        if (line[j] === ' ') {
          actualSpaces++
        }
        else if (line[j] === '\t') {
          actualSpaces += indentSize
        }
        else {
          break
        }
      }

      const expectedSpaces = (expectedLevel + Number(flow.continuation)) * indentSize

      // Report if indentation doesn't match (skip comments that may float)
      if (actualSpaces !== expectedSpaces && !source.protectedStart && trimmed !== '' && !line.trimStart().startsWith('#')) {
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
      if (flow.closesHeader || (!flow.continuation && shouldIncreaseAfter(trimmed, inCase)))
        expectedLevel++
    }
    return issues
  },
  fix(content, ctx) {
    const lines = shellSourceLines(content)
    const indentSize = ctx.config.format.indent || 2
    const useTab = ctx.config.format.indentStyle === 'tabs'
    const result: string[] = []
    let level = 0
    const continuation = new ShellContinuation()
    let inCase = false
    let caseDepth = 0

    for (let i = 0; i < lines.length; i++) {
      const source = lines[i]
      const line = source.text

      if (source.heredoc) {
        result.push(line)
        continue
      }
      if (/^\s*$/.test(line)) {
        result.push(source.protectedStart ? line : '')
        continue
      }
      const trimmed = source.masked.trim()
      const text = line.trimStart()
      const output = source.protectedEnd ? text : text.trimEnd()
      const flow = continuation.readMasked(trimmed, source.protectedEnd)

      // Shebang
      if (i === 0 && trimmed.startsWith('#!')) {
        result.push(output)
        continue
      }

      // Track case blocks
      if (/^case\b/.test(trimmed) && /\bin\s*$/.test(trimmed)) {
        caseDepth++
        inCase = true
      }
      if (/^esac\b/.test(trimmed)) {
        caseDepth = Math.max(0, caseDepth - 1)
        if (caseDepth === 0)
          inCase = false
      }

      if (!flow.continuation && shouldDecreaseBefore(trimmed))
        level = Math.max(0, level - 1)

      const visualLevel = level + Number(flow.continuation)
      const indent = useTab ? '\t'.repeat(visualLevel) : ' '.repeat(visualLevel * indentSize)
      result.push(source.protectedStart ? line : indent + output)

      if (flow.closesHeader || (!flow.continuation && shouldIncreaseAfter(trimmed, inCase)))
        level++
    }
    return result.join('\n')
  },
}
