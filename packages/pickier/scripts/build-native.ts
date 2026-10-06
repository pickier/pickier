/**
 * Cross-compile the native lint engine (packages/zig/src/native_main.zig) for
 * every platform pickier ships on, into dist/native/<platform>-<arch>/.
 *
 *   bun scripts/build-native.ts            # all targets
 *   bun scripts/build-native.ts --host     # this machine only
 *
 * Needs Zig 0.16 or newer on PATH (or in $ZIG). Without it the build is
 * skipped with a note - the CLI then lints on the TypeScript path, which
 * reports the same results - unless --required is passed (releases do).
 */
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

/* eslint-disable no-console -- a build script reports what it built */

const TARGETS: Array<{ dir: string, zig: string, exe: string }> = [
  { dir: 'darwin-arm64', zig: 'aarch64-macos', exe: 'pickier-native' },
  { dir: 'darwin-x64', zig: 'x86_64-macos', exe: 'pickier-native' },
  // Static musl builds run on glibc and musl systems alike
  { dir: 'linux-arm64', zig: 'aarch64-linux-musl', exe: 'pickier-native' },
  { dir: 'linux-x64', zig: 'x86_64-linux-musl', exe: 'pickier-native' },
  { dir: 'win32-arm64', zig: 'aarch64-windows', exe: 'pickier-native.exe' },
  { dir: 'win32-x64', zig: 'x86_64-windows', exe: 'pickier-native.exe' },
]

const args = process.argv.slice(2)
const required = args.includes('--required')
const hostOnly = args.includes('--host')
const zig = process.env.ZIG || Bun.which('zig')
const root = resolve(import.meta.dir, '..')
const entry = resolve(root, '../zig/src/native_main.zig')
const outRoot = resolve(root, 'dist/native')

if (!zig) {
  const note = 'build-native: zig not found; skipping the native engine (lint stays on the TypeScript path)'
  if (required) {
    console.error(note)
    process.exit(1)
  }
  console.warn(note)
  process.exit(0)
}

const targets = hostOnly ? TARGETS.filter(t => t.dir === `${process.platform}-${process.arch}`) : TARGETS
rmSync(outRoot, { recursive: true, force: true })
for (const t of targets) {
  const outDir = resolve(outRoot, t.dir)
  mkdirSync(outDir, { recursive: true })
  const r = Bun.spawnSync([zig, 'build-exe', entry, '-OReleaseFast', '-fstrip', '-target', t.zig, '--name', 'pickier-native', `-femit-bin=${resolve(outDir, t.exe)}`], { stdout: 'inherit', stderr: 'inherit' })
  if (r.exitCode !== 0) {
    console.error(`build-native: ${t.dir} failed`)
    process.exit(1)
  }
  // Windows builds leave a .pdb next to the exe; it is not needed at runtime
  rmSync(resolve(outDir, 'pickier-native.pdb'), { force: true })
  console.log(`build-native: ${t.dir}`)
}
