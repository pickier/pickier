/**
 * The other tools the benchmarks run, and a guard that each one works.
 *
 * Every CLI runs from this package's node_modules, so the versions are the
 * ones pinned in package.json — never whatever is on PATH or whatever `bunx`
 * downloads today. The Node CLIs (ESLint, Prettier, the oxfmt and Biome
 * launchers) run on whichever `node` is on PATH; ESLint needs real Node.
 *
 * The bench bodies swallow non-zero exits, because check mode and lint
 * findings use them. That also swallows a tool failing outright — a missing
 * config, a bad flag, a missing binary — and a tool that fails in a few
 * milliseconds is timed as the fastest in the table. `verifyCli` runs each
 * command for real before timing and refuses to continue on anything but
 * exit 0 or 1.
 */
import { execSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const bin = (name: string): string => resolve(__dirname, '../node_modules/.bin', name)

export const eslintCmd: string = bin('eslint')
export const oxlintCmd: string = bin('oxlint')
export const biomeCmd: string = bin('biome')
export const prettierCmd: string = bin('prettier')
export const oxfmtCmd: string = bin('oxfmt')

/** Biome 2's spelling of the shared style: single quotes, no semicolons, 2 spaces. */
export const biomeStyle = '--javascript-formatter-quote-style=single --semicolons=as-needed --indent-width=2'

/** The `node` the Node CLIs will run on, or null when only Bun is around. */
export function nodeVersion(): string | null {
  try {
    // `bun run` shims `node` with Bun when Node is missing; ask the runtime.
    return execSync(`node -e "if (typeof Bun === 'undefined') process.stdout.write(process.version)"`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }) || null
  }
  catch {
    return null
  }
}

export function version(cmd: string): string {
  try {
    return /\d+\.\d+\.\d+/.exec(execSync(`${cmd} --version`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }))?.[0] ?? '?'
  }
  catch {
    return '?'
  }
}

/**
 * Run `cmd` once and throw unless it exits 0 (clean) or 1 (findings / would
 * reformat). Exit 2 is how ESLint, Prettier and oxfmt report a crash or a
 * configuration error; Biome uses 1 for both, so its output is checked for
 * the error banner too.
 */
export function verifyCli(label: string, cmd: string, input?: string): void {
  const r = spawnSync('sh', ['-c', cmd], { cwd: resolve(__dirname, '..'), encoding: 'utf-8', input })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const failed = (r.status !== 0 && r.status !== 1)
    || /command not found|No such file|Cannot find module|configuration error|Unknown option|unexpected argument|Oops!/i.test(out)
  if (failed)
    throw new Error(`${label} did not run (exit ${r.status}): ${cmd}\n${out.slice(-1500)}`)
}
