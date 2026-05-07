export interface LoadConfigOptions<T> {
  name?: string
  alias?: readonly string[]
  defaultConfig?: T
  configPath?: string
  cwd?: string
  [key: string]: unknown
}

interface BunfigRuntime {
  loadConfig: <T = unknown>(options: LoadConfigOptions<T>) => Promise<T>
}

const bunfigRuntimePath = '../../node_modules/bunfig/dist/index.js'

/**
 * Typecheck shim for bunfig while its published declaration package is
 * regenerated. Bun tests honor tsconfig path aliases at runtime, so this file
 * forwards to the installed JS implementation instead of being ambient-only.
 */
export async function loadConfig<T = unknown>(options: LoadConfigOptions<T>): Promise<T> {
  const mod = await import(bunfigRuntimePath) as BunfigRuntime
  return mod.loadConfig<T>(options)
}
