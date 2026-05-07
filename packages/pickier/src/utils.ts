import type { PickierConfig, PickierOptions, RulesConfigMap } from './types'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { defaultConfig } from './config'

/**
 * Maximum number of fixer passes to run.
 * This prevents infinite loops when fixers keep modifying content.
 */
export const MAX_FIXER_PASSES = 5

// ---------------------------------------------------------------------------
// Homegrown glob — uses Bun.Glob when available, falls back to Node fs walk.
// Matches the tinyglobby API subset used in this project:
//   glob(patterns, { dot?, ignore?, onlyFiles?, absolute? })
// ---------------------------------------------------------------------------

interface GlobOptions {
  dot?: boolean
  ignore?: string[]
  onlyFiles?: boolean
  absolute?: boolean
  cwd?: string
}

/**
 * Convert a glob pattern to a RegExp.
 * Supports: * ** ? [...] and negation is handled at call-site.
 */
function globToRegex(pattern: string): RegExp {
  let src = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path segment including slashes
        src += '.*'
        i += 2
        // skip optional trailing slash after **
        if (pattern[i] === '/') i++
      }
      else {
        // * matches anything except /
        src += '[^/]*'
        i++
      }
    }
    else if (ch === '?') {
      src += '[^/]'
      i++
    }
    else if (ch === '[') {
      const end = pattern.indexOf(']', i)
      if (end === -1) {
        src += '\\['
        i++
      }
      else {
        src += pattern.slice(i, end + 1)
        i = end + 1
      }
    }
    else if (('.+^$' + '{}()|\\').includes(ch)) {
      src += `\\${ch}`
      i++
    }
    else {
      src += ch
      i++
    }
  }
  return new RegExp(`^${src}$`)
}

type IgnoreMatcher = (absPath: string) => boolean

/**
 * Walk a directory recursively, yielding file paths.
 * Skips directories matching ignore patterns.
 */
function* walkDirWithMatcher(dir: string, ignoreMatcher: IgnoreMatcher, dot: boolean): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return
  }
  for (const name of entries) {
    if (!dot && name.startsWith('.')) continue
    const full = join(dir, name)
    if (ignoreMatcher(full)) continue
    let st
    try { st = statSync(full) }
    catch { continue }
    if (st.isDirectory()) {
      yield* walkDirWithMatcher(full, ignoreMatcher, dot)
    }
    else {
      yield full
    }
  }
}

function* walkDir(dir: string, ignore: string[], dot: boolean, cwd: string): Generator<string> {
  yield* walkDirWithMatcher(dir, createIgnoreMatcher(ignore, cwd), dot)
}

/**
 * Glob files matching the given patterns.
 * Uses Bun.Glob when running under Bun for maximum performance,
 * falls back to a pure Node fs recursive walk otherwise.
 */
export async function glob(patterns: string[], opts: GlobOptions = {}): Promise<string[]> {
  const cwd = opts.cwd ?? process.cwd()
  const ignore = opts.ignore ?? []
  const dot = opts.dot ?? false
  const absolute = opts.absolute ?? true
  const ignoreMatcher = createIgnoreMatcher(ignore, cwd)

  // Fast path: Bun.Glob (available in Bun runtime)
  if (typeof (globalThis as any).Bun?.Glob !== 'undefined') {
    const BunGlob = (globalThis as any).Bun.Glob
    const results: string[] = []
    for (const pattern of patterns) {
      const g = new BunGlob(pattern)
      for await (const file of g.scan({ cwd, dot, onlyFiles: opts.onlyFiles ?? true, followSymlinks: false })) {
        const full = isAbsolute(file) ? file : join(cwd, file)
        const rel = full.startsWith(`${cwd}/`) ? full.slice(cwd.length + 1) : full
        if (ignoreMatcher(full)) continue
        results.push(absolute ? full : rel)
      }
    }
    return results
  }

  // Fallback: Node fs recursive walk
  const results: string[] = []
  for (const pattern of patterns) {
    // If pattern has no glob chars, treat as literal path
    if (!/[*?[{]/.test(pattern)) {
      const full = isAbsolute(pattern) ? pattern : join(cwd, pattern)
      try {
        const st = statSync(full)
        if (!st.isDirectory()) {
          const rel = full.startsWith(`${cwd}/`) ? full.slice(cwd.length + 1) : full
          if (!ignoreMatcher(full))
            results.push(absolute ? full : rel)
        }
        else {
          for (const f of walkDir(full, ignore, dot, cwd))
            results.push(absolute ? f : (f.startsWith(`${cwd}/`) ? f.slice(cwd.length + 1) : f))
        }
      }
      catch { /* skip missing */ }
      continue
    }
    const re = globToRegex(pattern)
    for (const f of walkDir(cwd, ignore, dot, cwd)) {
      const rel = f.startsWith(`${cwd}/`) ? f.slice(cwd.length + 1) : f
      if (re.test(rel) || re.test(rel.replace(/\\/g, '/')))
        results.push(absolute ? f : rel)
    }
  }
  return results
}

/**
 * Concurrency limiter — runs at most `concurrency` async tasks simultaneously.
 * Returns a scheduler function identical in signature to p-limit:
 *   const limit = createLimiter(8)
 *   await Promise.all(items.map(x => limit(() => process(x))))
 */
export function createLimiter(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: Array<() => void> = []

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      active++
      queue.shift()!()
    }
  }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn().then(
          (val) => {
            active--
            resolve(val)
            next()
          },
          (err) => {
            active--
            reject(err)
            next()
          },
        )
      }
      if (active < concurrency) {
        active++
        run()
      }
      else {
        queue.push(run)
      }
    })
  }
}

/**
 * Environment variable configuration with defaults.
 * Centralized to avoid scattered parsing and provide documentation.
 */
export interface EnvConfig {
  readonly TRACE: boolean
  readonly TIMEOUT_MS: number
  readonly RULE_TIMEOUT_MS: number
  readonly CONCURRENCY: number
  readonly DIAGNOSTICS: boolean
  readonly FAIL_ON_WARNINGS: boolean
  readonly NO_AUTO_CONFIG: boolean
}

export const ENV: EnvConfig = {
  /** Enable verbose trace logging. Set PICKIER_TRACE=1 to enable. */
  get TRACE(): boolean {
    return process.env.PICKIER_TRACE === '1'
  },
  /** Glob timeout in milliseconds. Default: 8000ms */
  get TIMEOUT_MS(): number {
    return Number(process.env.PICKIER_TIMEOUT_MS || '8000')
  },
  /** Per-rule timeout in milliseconds. Default: 5000ms */
  get RULE_TIMEOUT_MS(): number {
    return Number(process.env.PICKIER_RULE_TIMEOUT_MS || '5000')
  },
  /** Parallel file processing concurrency. Default: 8 */
  get CONCURRENCY(): number {
    return Number(process.env.PICKIER_CONCURRENCY) || 8
  },
  /** Enable diagnostics mode. Set PICKIER_DIAGNOSTICS=1 to enable. */
  get DIAGNOSTICS(): boolean {
    return process.env.PICKIER_DIAGNOSTICS === '1'
  },
  /** Treat warnings as errors. Set PICKIER_FAIL_ON_WARNINGS=1 to enable. */
  get FAIL_ON_WARNINGS(): boolean {
    return process.env.PICKIER_FAIL_ON_WARNINGS === '1'
  },
  /** Disable auto-loading of config. Set PICKIER_NO_AUTO_CONFIG=1 to disable. */
  get NO_AUTO_CONFIG(): boolean {
    return process.env.PICKIER_NO_AUTO_CONFIG === '1'
  },
}

/**
 * Universal ignore patterns that should apply everywhere.
 * These are always excluded regardless of project-specific config.
 */
export const UNIVERSAL_IGNORES: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.vercel/**',
  '**/.netlify/**',
  '**/.cache/**',
  '**/.turbo/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/.zed/**',
  '**/.cursor/**',
  '**/.claude/**',
  '**/.github/**',
  '**/coverage/**',
  '**/.nyc_output/**',
  '**/.tmp/**',
  '**/.temp/**',
  '**/vendor/**',
  '**/pantry/**',
  '**/target/**', // Rust
  '**/zig-cache/**', // Zig
  '**/zig-out/**', // Zig
  '**/.zig-cache/**', // Zig
  '**/__pycache__/**', // Python
  '**/.pytest_cache/**', // Python
  '**/venv/**', // Python
  '**/.venv/**', // Python
  '**/out/**',
  '**/.DS_Store',
  '**/Thumbs.db',
] as const

/**
 * Parse a rule configuration value and return its settings.
 * Handles both string format ('error', 'warn', 'off') and array format (['error', options]).
 */
export function getRuleSetting(rulesConfig: RulesConfigMap, ruleId: string): { enabled: boolean, severity?: 'error' | 'warning', options?: any } {
  let raw = rulesConfig[ruleId as keyof RulesConfigMap] as any
  // Fallback: try alternative prefix (general/ <-> pickier/) for backward compatibility
  if (raw === undefined) {
    const slash = ruleId.indexOf('/')
    if (slash > 0) {
      const prefix = ruleId.slice(0, slash)
      const name = ruleId.slice(slash + 1)
      const altPrefix = prefix === 'general' ? 'pickier' : prefix === 'pickier' ? 'general' : null
      if (altPrefix)
        raw = rulesConfig[`${altPrefix}/${name}` as keyof RulesConfigMap] as any
      // Also try bare rule name
      if (raw === undefined)
        raw = rulesConfig[name as keyof RulesConfigMap] as any
    }
  }
  let sev: 'error' | 'warning' | undefined
  let opts: any
  if (typeof raw === 'string') {
    if (raw === 'error')
      sev = 'error'
    else if (raw === 'warn' || raw === 'warning')
      sev = 'warning'
  }
  else if (Array.isArray(raw) && typeof raw[0] === 'string') {
    const s = raw[0]
    if (s === 'error')
      sev = 'error'
    else if (s === 'warn' || s === 'warning')
      sev = 'warning'
    opts = raw[1]
  }
  return { enabled: !!sev, severity: sev, options: opts }
}

/**
 * Colorize console output (simple ANSI colors)
 */
export function colorize(code: string, text: string): string {
  return `\x1B[${code}m${text}\x1B[0m`
}

export function green(text: string): string {
  return colorize('32', text)
}

export function red(text: string): string {
  return colorize('31', text)
}

export function yellow(text: string): string {
  return colorize('33', text)
}

export function blue(text: string): string {
  return colorize('34', text)
}

export function gray(text: string): string {
  return colorize('90', text)
}

export function bold(text: string): string {
  return colorize('1', text)
}

export const colors: {
  green: (text: string) => string
  red: (text: string) => string
  yellow: (text: string) => string
  blue: (text: string) => string
  gray: (text: string) => string
  bold: (text: string) => string
} = {
  green,
  red,
  yellow,
  blue,
  gray,
  bold,
}

// Shared CLI utilities (moved from cli/utils.ts)
export function mergeConfig(base: PickierConfig, override: PickierOptions): PickierConfig {
  // Merge ignores arrays: combine base + override, deduplicate
  const mergedIgnores = override.ignores
    ? [...new Set([...(base.ignores || []), ...override.ignores])]
    : base.ignores

  const mergedPluginRules: Record<string, any> = {
    ...((base as any).pluginRules || {}),
    ...((override as any).pluginRules || {}),
  }

  // Auto-enable sort-tailwind-classes when tailwind.enabled is true
  // (unless the user has already explicitly configured the rule)
  const tailwindCfg = override.tailwind ?? (base as any).tailwind
  if (tailwindCfg?.enabled && !Object.prototype.hasOwnProperty.call(mergedPluginRules, 'pickier/sort-tailwind-classes')) {
    mergedPluginRules['pickier/sort-tailwind-classes'] = 'warn'
  }

  return {
    ...base,
    ...override,
    verbose: override.verbose ?? base.verbose,
    ignores: mergedIgnores,
    lint: { ...base.lint, ...(override.lint || {}) },
    format: { ...base.format, ...(override.format || {}) },
    rules: { ...base.rules, ...(override.rules || {}) },
    pluginRules: mergedPluginRules as any,
  } as PickierConfig
}

// Cached copy of defaultConfig for NO_AUTO_CONFIG fast path
// Avoids re-allocating mergeConfig({}) on every call
let _cachedDefaultConfig: PickierConfig | null = null

export async function loadConfigFromPath(pathLike: string | undefined): Promise<PickierConfig> {
  if (!pathLike) {
    // Skip auto-loading in test environment
    if (ENV.NO_AUTO_CONFIG) {
      if (!_cachedDefaultConfig)
        _cachedDefaultConfig = mergeConfig(defaultConfig, {})
      return _cachedDefaultConfig
    }

    // Auto-load config via bunfig (searches pickier.config.ts, .config/pickier.ts, etc.)
    try {
      const { getConfig } = await import('./config')
      const cfg = await getConfig()
      return mergeConfig(defaultConfig, cfg)
    }
    catch {
      // If bunfig loading fails, fall back to defaultConfig
    }
    // Return a copy to avoid mutation of shared defaultConfig
    return mergeConfig(defaultConfig, {})
  }

  const abs = isAbsolute(pathLike) ? pathLike : resolve(process.cwd(), pathLike)
  const ext = extname(abs).toLowerCase()

  if (ext === '.json') {
    try {
      const raw = readFileSync(abs, 'utf8')
      return mergeConfig(defaultConfig, JSON.parse(raw) as PickierOptions)
    }
    catch {
      console.warn(`[pickier:warn] Config file not found: ${abs}. Using default config values.`)
      return mergeConfig(defaultConfig, {})
    }
  }

  try {
    const mod = await import(abs)
    return mergeConfig(defaultConfig, (mod.default || mod) as PickierOptions)
  }
  catch {
    console.warn(`[pickier:warn] Config file not found: ${abs}. Using default config values.`)
    return mergeConfig(defaultConfig, {})
  }
}

export function expandPatterns(patterns: string[]): string[] {
  return patterns.map((p) => {
    const hasMagic = /[*?[\]{}()!]/.test(p)
    if (hasMagic)
      return p
    // If it's a file-like input with extension, keep as-is
    if (/\.[A-Z0-9]+$/i.test(p))
      return p
    return `${p.replace(/\/$/, '')}/**/*`
  })
}

export function isCodeFile(file: string, allowedExts: Set<string>): boolean {
  const idx = file.lastIndexOf('.')
  if (idx < 0)
    return false
  const ext = file.slice(idx)
  return allowedExts.has(ext)
}

// Basic POSIX-like normalization for matching
function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/')
}

interface CompiledIgnorePattern {
  raw: string
  kind: 'extension' | 'segment' | 'suffix'
  value: string
}

function compileIgnoreGlobs(ignoreGlobs: readonly string[]): CompiledIgnorePattern[] {
  const compiled: CompiledIgnorePattern[] = []
  for (const g of ignoreGlobs) {
    const gg = toPosixPath(g.trim())
    if (!gg)
      continue

    // handle file extension patterns like **/*.test.ts or **/*.spec.ts
    const filePattern = gg.match(/\*\*\/\*\.(.+)$/)
    if (filePattern) {
      compiled.push({ raw: gg, kind: 'extension', value: filePattern[1] })
      continue
    }

    // handle patterns like any-depth/name/any-depth (including dot-prefixed names)
    const m = gg.match(/\*\*\/(.+?)\/\*\*$/)
    if (m) {
      compiled.push({ raw: gg, kind: 'segment', value: m[1] })
      continue
    }

    // handle any-depth/name (no trailing any-depth)
    const m2 = gg.match(/\*\*\/(.+)$/)
    if (m2) {
      compiled.push({ raw: gg, kind: 'suffix', value: m2[1].replace(/\/$/, '') })
    }
  }
  return compiled
}

/**
 * Build a reusable matcher for ignore checks.
 *
 * File discovery may check the same ignore list tens of thousands of times, so
 * callers should create one matcher per run and reuse it instead of reparsing
 * glob strings for every path.
 */
export function createIgnoreMatcher(ignoreGlobs: readonly string[], cwd: string = process.cwd()): IgnoreMatcher {
  if (ignoreGlobs.length === 0)
    return () => false

  const compiled = compileIgnoreGlobs(ignoreGlobs)
  if (compiled.length === 0)
    return () => false

  const universalRaw = new Set<string>(UNIVERSAL_IGNORES)

  return (absPath: string): boolean => {
    const normalizedAbs = toPosixPath(absPath)
    const normalizedCwd = toPosixPath(cwd).replace(/\/$/, '')
    const isOutsideProject = !normalizedAbs.startsWith(normalizedCwd)
    const rel = isOutsideProject
      ? normalizedAbs
      : normalizedAbs.slice(normalizedCwd.length)

    for (const pattern of compiled) {
      // Outside-project scans must not apply project-specific ignore rules such
      // as docs/** or custom test globs to arbitrary external paths.
      if (isOutsideProject && !universalRaw.has(pattern.raw))
        continue

      if (pattern.kind === 'extension') {
        if (rel.endsWith(`.${pattern.value}`))
          return true
        continue
      }

      if (pattern.kind === 'segment' || pattern.kind === 'suffix') {
        const name = pattern.value
        if (rel.includes(`/${name}/`) || rel.endsWith(`/${name}`))
          return true
      }
    }

    return false
  }
}

/**
 * Lightweight ignore matcher supporting common patterns like double-star slash
 * dir slash double-star. Kept for public utility callers; the linter hot path
 * should use `createIgnoreMatcher()` and reuse the returned function.
 */
export function shouldIgnorePath(absPath: string, ignoreGlobs: string[]): boolean {
  return createIgnoreMatcher(ignoreGlobs)(absPath)
}
