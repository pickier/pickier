import type { FormatOptions, LintIssue, PickierConfig, PickierPlugin, RulesConfigMap } from './types'
import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import process from 'node:process'
import { Logger } from '@stacksjs/clarity'
import { formatCode } from './format'
import { getAllPlugins } from './plugins'
import { colors, ENV, expandPatterns, glob, loadConfigFromPath, MAX_FIXER_PASSES, shouldIgnorePath } from './utils'

let _logger: Logger | null = null
function getLogger(): Logger {
  if (!_logger)
    _logger = new Logger('pickier', { showTags: false })
  return _logger
}

function trace(...args: any[]) {
  if (ENV.TRACE)
    getLogger().debug('[pickier:trace]', args)
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let to: any
  const timeout = new Promise<never>((_, reject) => {
    to = setTimeout(() => reject(new Error(`Timeout after ${ms}ms at ${label}`)), ms)
  })
  try {
    const res = await Promise.race([p, timeout])
    clearTimeout(to)
    return res as T
  }
  catch (e) {
    getLogger().error(`[pickier:error] ${label} failed:`, (e as any)?.message || e)
    trace('withTimeout error:', label, e)
    throw e
  }
}

export function applyPluginFixes(filePath: string, content: string, cfg: PickierConfig): string {
  const pluginDefs: Array<PickierPlugin> = getAllPlugins()

  const rulesConfig: RulesConfigMap = (cfg.pluginRules || {}) as RulesConfigMap
  const isRuleEnabled = (ruleId: string) => (rulesConfig as any)[ruleId] !== 'off'

  let current = content
  let changed = true
  let passes = 0

  while (changed && passes < MAX_FIXER_PASSES) {
    changed = false
    passes++
    for (const plugin of pluginDefs) {
      for (const ruleName in plugin.rules) {
        const fullRuleId = `${plugin.name}/${ruleName}`
        if (!isRuleEnabled(fullRuleId))
          continue
        const rule = plugin.rules[ruleName]!
        if (!rule.fix)
          continue
        const fixed = rule.fix(current, { filePath, config: cfg })
        if (fixed !== current) {
          current = fixed
          changed = true
        }
      }
    }
    trace('format pass', relative(process.cwd(), filePath), changed ? 'changed' : 'unchanged')
  }

  return current
}

export function applyFixes(filePath: string, content: string, cfg: PickierConfig): string {
  let current = content
  // 1) quick built-in fix: strip debugger statements if rule enabled
  const lines = current.split(/\r?\n/)
  const kept: string[] = []
  const debuggerStmt = /^\s*debugger\b/
  for (const line of lines) {
    if (cfg.rules.noDebugger !== 'off' && debuggerStmt.test(line))
      continue
    kept.push(line)
  }
  current = kept.join('\n')

  // 2) apply plugin rule fixers iteratively
  current = applyPluginFixes(filePath, current, cfg)

  // 3) apply global formatter as a canonical fixer (until all formatters are migrated to rules)
  current = formatCode(current, cfg, filePath)

  return current
}

export function formatVerbose(issues: LintIssue[]): string {
  if (issues.length === 0)
    return ''

  // Group issues by file
  const byFile = new Map<string, LintIssue[]>()
  for (const issue of issues) {
    const list = byFile.get(issue.filePath) || []
    list.push(issue)
    byFile.set(issue.filePath, list)
  }

  let out = ''
  for (const [filePath, fileIssues] of byFile) {
    // Print filename header
    out += `\n${colors.bold(`\x1B[4m${filePath}\x1B[24m`)}\n`

    // Read the file to get source code for snippets
    let fileContent: string
    try {
      fileContent = readFileSync(filePath, 'utf8')
    }
    catch {
      // If we can't read the file, fall back to basic formatting without snippets
      for (const issue of fileIssues) {
        const sev = issue.severity === 'error' ? colors.red('error') : colors.yellow('warn ')
        out += `  ${issue.line}:${issue.column}  ${sev}  ${issue.message}  ${colors.blue(issue.ruleId)}\n`
      }
      continue
    }

    const lines = fileContent.split(/\r?\n/)

    for (const issue of fileIssues) {
      const icon = issue.severity === 'error' ? colors.red('!') : colors.yellow('!')
      const ruleText = colors.blue(issue.ruleId)

      // Header: "  ! rule-id: message"
      out += `\n  ${icon} ${ruleText}: ${issue.message}\n`

      // Show context: 2 lines before and after the error line
      const contextBefore = 2
      const contextAfter = 2
      const startLine = Math.max(1, issue.line - contextBefore)
      const endLine = Math.min(lines.length, issue.line + contextAfter)

      // Calculate padding for line numbers
      const maxLineNum = endLine
      const lineNumWidth = String(maxLineNum).length

      // Location indicator: "    ,-[:line:col]"
      out += `  ${colors.gray('  ,-')}${colors.gray(`[:${issue.line}:${issue.column}]`)}\n`

      // Show code snippet with line numbers
      for (let i = startLine; i <= endLine; i++) {
        const lineNum = String(i).padStart(lineNumWidth)
        const lineContent = lines[i - 1] || ''

        if (i === issue.line) {
          // Highlight the error line
          out += ` ${colors.gray(lineNum)} ${colors.gray('|')} ${colors.red(',->     ')}${lineContent}\n`
        }
        else if (i === issue.line + 1 && contextAfter > 0) {
          // Show continuation marker on next line if needed
          out += ` ${colors.gray(lineNum)} ${colors.gray('|')} ${colors.red('|         ')}${lineContent}\n`
        }
        else if (i === issue.line + contextAfter && contextAfter > 1) {
          // Last line with end marker
          out += ` ${colors.gray(lineNum)} ${colors.gray('|')} ${colors.red('`->     ')}${lineContent}\n`
        }
        else {
          // Regular context line
          out += ` ${colors.gray(lineNum)} ${colors.gray('|       ')}${lineContent}\n`
        }
      }

      // End marker
      out += `  ${colors.gray('  `----')}\n`

      // Help text if available
      if (issue.help) {
        out += `  ${colors.blue('help')}: ${issue.help}\n`
      }
    }
  }

  return out
}

export function formatStylish(issues: LintIssue[]): string {
  if (issues.length === 0)
    return ''

  // Group issues by file
  const byFile = new Map<string, LintIssue[]>()
  for (const issue of issues) {
    const list = byFile.get(issue.filePath) || []
    list.push(issue)
    byFile.set(issue.filePath, list)
  }

  let out = ''
  for (const [filePath, fileIssues] of byFile) {
    // Use full absolute path and underline it (ESLint style)
    out += `\n${colors.bold(`\x1B[4m${filePath}\x1B[24m`)}\n`

    for (const issue of fileIssues) {
      const sev = issue.severity === 'error' ? colors.red('error') : colors.yellow('warn ')

      // Format: "  line:col  severity  message  ruleId"
      // Pad line:col to align nicely (e.g., "  5:10")
      const lineCol = `${issue.line}:${issue.column}`
      const paddedLineCol = lineCol.padStart(6)

      // Align message and ruleId with proper spacing
      // Message on left, ruleId on right (like ESLint)
      const messageWidth = 60
      const paddedMessage = issue.message.padEnd(messageWidth)

      out += `${paddedLineCol}  ${sev}  ${paddedMessage}  ${colors.blue(issue.ruleId)}\n`
    }
  }
  return out
}

export async function runFormat(globs: string[], options: FormatOptions): Promise<number> {
  trace('runFormat:start', { globs, options })
  const cfg = await loadConfigFromPath(options.config)
  const raw = globs.length ? globs : ['.']
  const patterns = expandPatterns(raw)
  trace('patterns', patterns)
  const extSet = new Set((options.ext || cfg.format.extensions.join(',')).split(',').map((s: string) => {
    const t = s.trim()
    return t.startsWith('.') ? t : `.${t}`
  }))

  const timeoutMs = ENV.TIMEOUT_MS
  let entries: string[] = []
  const simpleDirPattern = patterns.length === 1 && /\*\*\/*\*$/.test(patterns[0])
  if (simpleDirPattern) {
    const base = patterns[0].replace(/\/?\*\*\/*\*\*?$/, '')
    try {
      const { readdirSync, statSync } = await import('node:fs')
      const { join } = await import('node:path')
      const stack: string[] = [base]
      while (stack.length) {
        const dir = stack.pop()!
        const items = readdirSync(dir)
        for (const it of items) {
          const full = join(dir, it)
          const st = statSync(full)
          if (shouldIgnorePath(full, cfg.ignores))
            continue
          if (st.isDirectory())
            stack.push(full)
          else
            entries.push(full)
        }
      }
    }
    catch {
      entries = await withTimeout(glob(patterns, {
        dot: false,
        ignore: cfg.ignores,
        onlyFiles: true,
        absolute: true,
      }), timeoutMs, 'glob')
    }
  }
  else {
    entries = await withTimeout(glob(patterns, {
      dot: false,
      ignore: cfg.ignores,
      onlyFiles: true,
      absolute: true,
    }), timeoutMs, 'glob')
  }

  trace('globbed entries', entries.length)

  const files = entries.filter((f) => {
    if (shouldIgnorePath(f, cfg.ignores))
      return false
    const idx = f.lastIndexOf('.')
    if (idx < 0)
      return true // include files without extensions (edge-case test expects this)
    const ext = f.slice(idx)
    return extSet.has(ext)
  })
  trace('filtered files', files.length)

  let changed = 0
  let checked = 0
  for (const file of files) {
    trace('format start', relative(process.cwd(), file))
    const src = readFileSync(file, 'utf8')
    const fmt = formatCode(src, cfg, file)
    if (options.check) {
      if (fmt !== src) {
        getLogger().debug(`${relative(process.cwd(), file)} needs formatting`)
        changed++
      }
      checked++
    }
    else if (options.write) {
      if (fmt !== src) {
        writeFileSync(file, fmt, 'utf8')
        changed++
      }
      checked++
    }
    else {
      // default to check mode when neither flag specified
      if (fmt !== src) {
        getLogger().debug(`${relative(process.cwd(), file)} needs formatting`)
        changed++
      }
      checked++
    }
  }

  const isVerbose = options.verbose !== undefined ? options.verbose : cfg.verbose
  if (isVerbose) {
    getLogger().debug(colors.gray(`Checked ${checked} files, ${changed} changed.`))
  }

  // In check mode, non-zero exit when changes are needed; otherwise 0
  return options.check && changed > 0 ? 1 : 0
}
