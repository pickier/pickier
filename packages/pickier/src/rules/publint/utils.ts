import type { LintIssue } from '../../types'
import { dirname, resolve } from 'node:path'

/**
 * Safely parse package.json content. Returns null on failure.
 */
export function parsePackageJson(content: string): Record<string, any> | null {
  try {
    const pkg = JSON.parse(content)
    if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg))
      return null
    return pkg
  }
  catch {
    return null
  }
}

/**
 * Find the line number where a JSON key path appears in the raw content.
 * Walks through the path segments to find the most specific match.
 */
export function findJsonKeyLine(content: string, keyPath: string[]): number {
  const lines = content.split('\n')
  let bestLine = 1

  // For each segment of the path, find its line number
  // Start searching from the previous match's line to handle nesting
  let searchStart = 0
  for (const key of keyPath) {
    // Try matching "key": or "key" at the start of a JSON property
    const keyPattern = new RegExp(`"${escapeRegex(key)}"\\s*:`)
    for (let i = searchStart; i < lines.length; i++) {
      if (keyPattern.test(lines[i])) {
        bestLine = i + 1
        searchStart = i + 1
        break
      }
    }
  }

  return bestLine
}

/**
 * Get the package directory from a file path (dirname of the package.json).
 */
export function getPkgDir(filePath: string): string {
  return dirname(filePath)
}

/**
 * Resolve a package-relative path to an absolute path.
 */
export function resolvePkgPath(pkgDir: string, relativePath: string): string {
  return resolve(pkgDir, relativePath)
}

/**
 * Format a JSON path for human-readable messages.
 * e.g. ['exports', '.', 'types'] -> 'pkg.exports["."].types'
 */
export function formatPkgPath(path: string[]): string {
  let formatted = 'pkg'
  for (const part of path) {
    if (/^\d+$/.test(part)) {
      formatted += `[${part}]`
    }
    else if (!/^[a-z_$][a-z0-9_$]*$/i.test(part)) {
      formatted += `["${part}"]`
    }
    else {
      formatted += `.${part}`
    }
  }
  return formatted
}

/**
 * Get a published field value, respecting publishConfig overrides.
 * Returns [value, path] tuple.
 */
export function getPublishedField(pkg: Record<string, any>, field: string): [any, string[]] {
  if (pkg.publishConfig?.[field] !== undefined) {
    return [pkg.publishConfig[field], ['publishConfig', field]]
  }
  return [pkg[field], [field]]
}

// ESM/CJS format detection (from publint's utils.js)
const ESM_CONTENT_RE = /([\s;]|^)(import[\w,{}\s*]*from|import\s*['"*{]|export\b\s*(?:[*{]|default|type|function|const|var|let|async function)|import\.meta\b)/m
const CJS_CONTENT_RE = /([\s;]|^)(module.exports\b|exports\.\w|require\s*\(|global\.\w|Object\.(defineProperty|defineProperties|assign)\s*\(\s*exports\b)/m

export type CodeFormat = 'ESM' | 'CJS' | 'mixed' | 'unknown'

/**
 * Detect the code format (ESM, CJS, mixed, or unknown) from file content.
 */
export function getCodeFormat(code: string): CodeFormat {
  const stripped = stripComments(code)
  const isEsm = ESM_CONTENT_RE.test(stripped)
  const isCjs = CJS_CONTENT_RE.test(stripped)
  if (isEsm && isCjs) return 'mixed'
  if (isEsm) return 'ESM'
  if (isCjs) return 'CJS'
  return 'unknown'
}

/**
 * Determine the expected code format from a file path and nearest package.json type field.
 */
export function getFilePathFormat(filePath: string, pkgType?: string): 'ESM' | 'CJS' {
  if (filePath.endsWith('.mjs')) return 'ESM'
  if (filePath.endsWith('.cjs')) return 'CJS'
  return pkgType === 'module' ? 'ESM' : 'CJS'
}

/**
 * Get the expected file extension for a given code format.
 */
export function getCodeFormatExtension(format: CodeFormat): string {
  if (format === 'ESM') return '.mjs'
  if (format === 'CJS') return '.cjs'
  return '.js'
}

/**
 * Whether an extension is explicit (.mjs or .cjs).
 */
export function isExplicitExtension(ext: string): boolean {
  return ext === '.mjs' || ext === '.cjs'
}

/**
 * Check if a file path has a lintable extension for format checking.
 */
export function isLintableFilePath(filePath: string): boolean {
  return filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')
}

/**
 * Check if a file starts with a shebang.
 */
export function startsWithShebang(code: string): boolean {
  return /^#!\s*\//.test(code)
}

/**
 * Strip comments from JavaScript code for format detection.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*(.|[\r\n])*?\*\//gm, '').replace(/\/\/.*/g, '')
}

// Crawl exports/imports types

export interface CrawlContext {
  /** Current JSON path, e.g. ['exports', '.', 'import'] */
  path: string[]
  /** true when crawling "imports" instead of "exports" */
  isImports: boolean
}

export type CrawlVisitor = (
  value: any,
  ctx: CrawlContext,
  /** The keys of the current object level (for condition ordering checks) */
  objectKeys?: string[],
) => void

/**
 * Recursively crawl an exports or imports object, calling visitor for each node.
 * Handles string values, array values (fallback), and object values (conditions/subpaths).
 */
export function crawlExportsOrImports(
  value: any,
  basePath: string[],
  isImports: boolean,
  visitor: CrawlVisitor,
): void {
  _crawl(value, basePath, isImports, visitor)
}

function _crawl(
  value: any,
  currentPath: string[],
  isImports: boolean,
  visitor: CrawlVisitor,
): void {
  if (typeof value === 'string') {
    visitor(value, { path: currentPath, isImports })
    return
  }

  if (Array.isArray(value)) {
    visitor(value, { path: currentPath, isImports })
    for (let i = 0; i < value.length; i++) {
      _crawl(value[i], currentPath.concat(String(i)), isImports, visitor)
    }
    return
  }

  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    visitor(value, { path: currentPath, isImports }, keys)
    for (const key of keys) {
      _crawl(value[key], currentPath.concat(key), isImports, visitor)
    }
  }
}

/**
 * Create a LintIssue for a publint rule.
 */
export function createIssue(
  filePath: string,
  content: string,
  keyPath: string[],
  ruleId: string,
  message: string,
  severity: 'warning' | 'error',
  help?: string,
): LintIssue {
  return {
    filePath,
    line: findJsonKeyLine(content, keyPath),
    column: 1,
    ruleId,
    message,
    severity,
    ...(help && { help }),
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
