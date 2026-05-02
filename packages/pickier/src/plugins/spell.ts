import type { LintIssue, PickierPlugin, RuleContext, RuleModule } from '../types'

/**
 * Native spell-check plugin for pickier.
 * Uses @stacksjs/ts-spell-check as an optional dependency — gracefully degrades if not installed.
 *
 * Rules:
 *   spell/check          — Check spelling in all text
 *   spell/check-comments — Check spelling only in comments
 *   spell/check-markdown — Check spelling in markdown files
 */

// ── Cached module + checker ─────────────────────────────────────
// The checker loads async (first call triggers it), subsequent calls use the cache.

let _tssc: any = null
let _checker: any = null
let _loaded = false
let _available = true

function ensureLoaded(): boolean {
  if (_loaded) return _available

  try {
    _tssc = require('@stacksjs/ts-spell-check')
    // SpellChecker.create() is async — we trigger it and use a sync fallback until ready
    _tssc.SpellChecker.create({ minWordLength: 3, maxSuggestions: 3 }).then((c: any) => {
      _checker = c
    }).catch(() => {
      _available = false
    })
    _loaded = true
    return true
  }
  catch {
    _loaded = true
    _available = false
    return false
  }
}

// ── Rule factory ────────────────────────────────────────────────

function createSpellRule(
  ruleId: string,
  filterFn?: (line: string) => boolean,
): RuleModule {
  return {
    meta: {
      docs: ruleId === 'spell/check'
        ? 'Check spelling in text content'
        : ruleId === 'spell/check-comments'
          ? 'Check spelling in code comments only'
          : 'Check spelling in markdown files',
    },
    check(content: string, ctx: RuleContext): LintIssue[] {
      if (!ensureLoaded() || !_tssc) return []

      const { extractWords, parseDirectives, isSuppressed, getProgrammingWords } = _tssc

      const opts = ctx.options as any
      const userWords = new Set<string>((opts?.words || []).map((w: string) => w.toLowerCase()))
      const minLen = opts?.minWordLength || 3
      const progWords = getProgrammingWords()

      // Parse directives and collect inline words
      const directives = parseDirectives(content)
      for (const d of directives) {
        if (d.type === 'word') d.words.forEach((w: string) => userWords.add(w.toLowerCase()))
      }

      const lines = content.split(/\r?\n/)
      const issues: LintIssue[] = []

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]
        const lineNum = lineIdx + 1

        // Apply line filter (comments-only, etc.)
        if (filterFn && !filterFn(line)) continue

        const words = extractWords(line)
        for (const { word, offset: wordOffset } of words) {
          if (word.length < minLen) continue
          if (word.length <= 2) continue
          if (word === word.toUpperCase() && word.length <= 5) continue
          if (userWords.has(word.toLowerCase())) continue
          if (progWords.has(word.toLowerCase())) continue
          if (isSuppressed(word, lineNum, directives, userWords)) continue

          // Use the loaded checker for actual dictionary lookup (if ready)
          if (_checker) {
            if (_checker.isCorrect(word)) continue
            const suggestions = _checker.suggest(word)
            issues.push({
              filePath: ctx.filePath,
              line: lineNum,
              column: wordOffset + 1,
              ruleId,
              message: `Unknown word: "${word}"`,
              severity: 'warning',
              help: suggestions.length
                ? `Did you mean: ${suggestions.slice(0, 3).join(', ')}? Or add to config words.`
                : `Add "${word}" to your config words array, or use: // spell-check:ignore ${word}`,
            })
          }
          // Checker not ready yet (first run) — skip silently, will work on next lint
        }
      }

      return issues
    },
  }
}

// ── Comment line detection ──────────────────────────────────────

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')
}

// ── Plugin export ───────────────────────────────────────────────

export const spellPlugin: PickierPlugin = {
  name: 'spell',
  rules: {
    'check': createSpellRule('spell/check'),
    'check-comments': createSpellRule('spell/check-comments', isCommentLine),
    'check-markdown': {
      meta: { docs: 'Check spelling in markdown files' },
      check(content: string, ctx: RuleContext): LintIssue[] {
        if (!ctx.filePath.endsWith('.md')) return []
        return createSpellRule('spell/check-markdown').check(content, ctx)
      },
    },
  },
}
