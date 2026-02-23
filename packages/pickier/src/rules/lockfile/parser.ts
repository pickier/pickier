/**
 * Lockfile parser for npm, yarn, and bun lockfiles.
 * Normalizes different formats into a unified structure for validation.
 */

export interface ParsedPackage {
  name: string
  version: string
  resolved?: string
  integrity?: string
}

export interface ParsedLockfile {
  type: 'npm' | 'yarn' | 'yarn-berry' | 'bun'
  packages: Map<string, ParsedPackage>
}

// Registry aliases for convenience
export const REGISTRY_ALIASES: Record<string, string> = {
  npm: 'registry.npmjs.org',
  yarn: 'registry.yarnpkg.com',
  verdaccio: 'registry.verdaccio.org',
}

/**
 * Detect lockfile type from filename
 */
export function detectLockfileType(filePath: string): 'npm' | 'yarn' | 'bun' | null {
  const fileName = filePath.split('/').pop() || ''
  if (fileName === 'package-lock.json')
    return 'npm'
  if (fileName === 'yarn.lock')
    return 'yarn'
  if (fileName === 'bun.lockb' || fileName === 'bun.lock')
    return 'bun'
  return null
}

/**
 * Check if content is a lockfile based on structure
 */
export function isLockfileContent(content: string, filePath: string): boolean {
  const lockfileType = detectLockfileType(filePath)
  if (!lockfileType)
    return false

  if (lockfileType === 'npm') {
    try {
      const parsed = JSON.parse(content)
      return 'lockfileVersion' in parsed || 'dependencies' in parsed || 'packages' in parsed
    }
    catch {
      return false
    }
  }

  if (lockfileType === 'yarn') {
    // Yarn lockfiles start with a comment or have the __metadata key (berry)
    return content.startsWith('#') || content.includes('__metadata:') || content.includes('resolved "')
  }

  if (lockfileType === 'bun') {
    // Bun lockfiles are binary (bun.lockb) or JSON-like (bun.lock)
    // For now, we only support the JSON variant
    try {
      const parsed = JSON.parse(content)
      return 'lockfileVersion' in parsed || 'packages' in parsed
    }
    catch {
      return false
    }
  }

  return false
}

/**
 * Parse npm package-lock.json (supports v1, v2, v3)
 */
export function parseNpmLockfile(content: string): ParsedLockfile {
  const packages = new Map<string, ParsedPackage>()
  const parsed = JSON.parse(content)
  const lockfileVersion = parsed.lockfileVersion || 1

  if (lockfileVersion >= 2 && parsed.packages) {
    // v2/v3 format with packages object
    for (const [key, pkg] of Object.entries(parsed.packages as Record<string, any>)) {
      if (!key || key === '')
        continue // Skip root package

      // Extract package name from key (node_modules/pkg-name or node_modules/@scope/pkg-name)
      const namePart = key.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '/')
      const name = namePart.split('/node_modules/').pop() || namePart

      // Include all packages, even without resolved/integrity (for emptyHostname validation)
      packages.set(key, {
        name,
        version: pkg.version || '',
        resolved: pkg.resolved,
        integrity: pkg.integrity,
      })
    }
  }
  else if (parsed.dependencies) {
    // v1 format with nested dependencies
    flattenNpmDependencies(parsed.dependencies, packages, '')
  }

  return { type: 'npm', packages }
}

/**
 * Recursively flatten npm v1 nested dependencies
 */
function flattenNpmDependencies(
  deps: Record<string, any>,
  packages: Map<string, ParsedPackage>,
  prefix: string,
): void {
  for (const [name, pkg] of Object.entries(deps)) {
    const key = prefix ? `${prefix}/${name}` : name

    // Include all packages, even without resolved/integrity
    packages.set(key, {
      name,
      version: pkg.version || '',
      resolved: pkg.resolved,
      integrity: pkg.integrity,
    })

    // Recurse into nested dependencies
    if (pkg.dependencies) {
      flattenNpmDependencies(pkg.dependencies, packages, key)
    }
  }
}

/**
 * Parse yarn.lock (supports classic v1 and berry/v2+)
 */
export function parseYarnLockfile(content: string): ParsedLockfile {
  const packages = new Map<string, ParsedPackage>()

  // Check if this is Yarn Berry (v2+) format
  const isBerry = content.includes('__metadata:')
  const type: 'yarn' | 'yarn-berry' = isBerry ? 'yarn-berry' : 'yarn'

  // Simple YAML-like parser for yarn.lock
  const lines = content.split('\n')
  let currentKey = ''
  let currentPkg: Partial<ParsedPackage> = {}

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '')
      continue

    // Package entry header (e.g., "pkg-name@version:" or "pkg-name@npm:version:")
    if (!line.startsWith(' ') && line.includes('@') && line.endsWith(':')) {
      // Save previous package
      if (currentKey && (currentPkg.resolved || currentPkg.integrity)) {
        packages.set(currentKey, currentPkg as ParsedPackage)
      }

      // Parse new package key
      currentKey = line.slice(0, -1).trim()
      // Handle quoted keys
      if (currentKey.startsWith('"') && currentKey.endsWith('"')) {
        currentKey = currentKey.slice(1, -1)
      }

      // Extract name from key (handle scoped packages and version ranges)
      const nameMatch = currentKey.match(/^(@?[^@]+)@/)
      const name = nameMatch ? nameMatch[1] : currentKey.split('@')[0]

      currentPkg = { name, version: '' }
    }
    else if (line.startsWith('  ') || line.startsWith('\t')) {
      // Property line
      const trimmed = line.trim()

      if (trimmed.startsWith('version')) {
        const match = trimmed.match(/version[:\s]+"?([^"]+)"?/)
        if (match)
          currentPkg.version = match[1]
      }
      else if (trimmed.startsWith('resolved')) {
        const match = trimmed.match(/resolved[:\s]+"?([^"]+)"?/)
        if (match)
          currentPkg.resolved = match[1]
      }
      else if (trimmed.startsWith('resolution:') && isBerry) {
        // Yarn Berry uses "resolution" instead of "resolved"
        const match = trimmed.match(/resolution[:\s]+"?([^"]+)"?/)
        if (match)
          currentPkg.resolved = match[1]
      }
      else if (trimmed.startsWith('integrity') || trimmed.startsWith('checksum')) {
        const match = trimmed.match(/(integrity|checksum)[:\s]+"?([^"]+)"?/)
        if (match)
          currentPkg.integrity = match[2]
      }
    }
  }

  // Save last package
  if (currentKey && (currentPkg.resolved || currentPkg.integrity)) {
    packages.set(currentKey, currentPkg as ParsedPackage)
  }

  return { type, packages }
}

/**
 * Parse bun.lock (JSON format)
 *
 * Bun lockfile format (v1):
 * {
 *   "lockfileVersion": 1,
 *   "packages": {
 *     "pkg-name": ["pkg-name@version", "resolved-url", { deps }, "integrity-hash"],
 *     "@scope/pkg": ["@scope/pkg@version", "", { deps }, "sha512-..."],
 *   }
 * }
 *
 * Array format: [name@version, resolved_url, meta_object, integrity_hash]
 * Note: resolved_url is often empty string for packages from default registry
 */
export function parseBunLockfile(content: string): ParsedLockfile {
  const packages = new Map<string, ParsedPackage>()
  const parsed = JSON.parse(content)

  if (parsed.packages) {
    for (const [key, pkg] of Object.entries(parsed.packages as Record<string, any>)) {
      if (!key || key === '')
        continue

      // Bun lockfile format: array [name@version, resolved, meta, integrity]
      if (Array.isArray(pkg)) {
        const [nameVersion, resolved, _meta, integrity] = pkg

        // Extract version from "name@version" string
        let name = key
        let version = ''
        if (typeof nameVersion === 'string' && nameVersion.includes('@')) {
          // Handle scoped packages (@scope/name@version)
          const lastAtIndex = nameVersion.lastIndexOf('@')
          if (lastAtIndex > 0) {
            name = nameVersion.substring(0, lastAtIndex)
            version = nameVersion.substring(lastAtIndex + 1)
          }
        }

        packages.set(key, {
          name,
          version,
          resolved: resolved || undefined,
          integrity: integrity || undefined,
        })
      }
      else if (typeof pkg === 'object') {
        packages.set(key, {
          name: pkg.name || key.split('@')[0],
          version: pkg.version || '',
          resolved: pkg.resolved,
          integrity: pkg.integrity || pkg.hash,
        })
      }
    }
  }

  return { type: 'bun', packages }
}

/**
 * Parse a lockfile based on its type
 */
export function parseLockfile(content: string, filePath: string): ParsedLockfile | null {
  const type = detectLockfileType(filePath)

  if (!type)
    return null

  try {
    switch (type) {
      case 'npm':
        return parseNpmLockfile(content)
      case 'yarn':
        return parseYarnLockfile(content)
      case 'bun':
        return parseBunLockfile(content)
      default:
        return null
    }
  }
  catch {
    return null
  }
}

/**
 * Extract host from a resolved URL
 */
export function extractHost(resolvedUrl: string): string | null {
  try {
    const url = new URL(resolvedUrl)
    return url.hostname
  }
  catch {
    return null
  }
}

/**
 * Extract protocol/scheme from a resolved URL
 */
export function extractScheme(resolvedUrl: string): string | null {
  try {
    const url = new URL(resolvedUrl)
    return url.protocol
  }
  catch {
    return null
  }
}

/**
 * Extract package name from a resolved URL
 * Works for npm/yarn registry URLs like:
 * - https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz
 * - https://registry.npmjs.org/@babel/core/-/core-7.0.0.tgz
 */
export function extractPackageNameFromUrl(resolvedUrl: string): string | null {
  try {
    const url = new URL(resolvedUrl)
    const pathname = url.pathname

    // Find the /-/ separator which precedes the tarball filename
    const separatorIndex = pathname.indexOf('/-/')
    if (separatorIndex === -1)
      return null

    // Extract the package name part (everything before /-/)
    const pkgPath = pathname.substring(1, separatorIndex) // Remove leading /

    // Handle scoped packages (@scope/name)
    if (pkgPath.startsWith('@')) {
      return pkgPath
    }

    return pkgPath
  }
  catch {
    return null
  }
}

/**
 * Extract integrity hash type (sha1, sha256, sha512, etc.)
 */
export function extractIntegrityType(integrity: string): string | null {
  if (!integrity)
    return null
  const match = integrity.match(/^(sha\d+)-/)
  return match ? match[1] : null
}

/**
 * Expand host aliases to actual hostnames
 */
export function expandHostAliases(hosts: string[]): string[] {
  return hosts.map((host) => {
    const lower = host.toLowerCase()
    return REGISTRY_ALIASES[lower] || host
  })
}
