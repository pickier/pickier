/**
 * Which Pickier CLI the CLI benchmarks spawn.
 *
 * By default this is the CLI that ships on npm — the bundled
 * `packages/pickier/dist/bin/cli.js` that `bunx pickier` runs, doing exactly
 * the work `formatCode()` does. Build it first (`bun run build` in
 * packages/pickier); a missing build fails and a stale one warns.
 *
 * The Zig port in `packages/zig` is opt-in with `PICKIER_BENCH_ZIG=1`: it is
 * not published and its formatter does not match the TypeScript one, so
 * timing it as "Pickier" would compare different work.
 *
 * Callers swallow non-zero exits because check mode uses them, so a missing
 * binary would be timed as an instant failure and look like the fastest tool
 * in the table. Fail loudly instead.
 */
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const pkgDir = resolve(__dirname, '../../packages/pickier')
const zigBin = resolve(__dirname, '../../packages/zig/zig-out/bin/pickier-zig')
const distCli = resolve(pkgDir, 'dist/bin/cli.js')

export const pickierIsZig: boolean = process.env.PICKIER_BENCH_ZIG === '1'
if (pickierIsZig && !existsSync(zigBin))
  throw new Error(`PICKIER_BENCH_ZIG=1 but ${zigBin} is missing; build it with \`zig build -Doptimize=ReleaseFast\` in packages/zig`)

if (!pickierIsZig) {
  if (!existsSync(distCli))
    throw new Error(`${distCli} is missing; run \`bun run build\` in packages/pickier first`)
  const built = statSync(distCli).mtimeMs
  const newest = Math.max(...Array.from(new Bun.Glob('{src/**/*.ts,bin/cli.ts}').scanSync({ cwd: pkgDir, absolute: true }), f => statSync(f).mtimeMs))
  if (newest > built)
    console.warn(`warning: packages/pickier/src is newer than ${distCli}; run \`bun run build\` there or you are timing old code`)
}

export const pickierCli: string = pickierIsZig ? zigBin : `bun ${distCli}`
export const pickierCliLabel: string = pickierIsZig ? 'Pickier (Zig)' : 'Pickier (cli)'
