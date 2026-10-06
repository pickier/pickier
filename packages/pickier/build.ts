import type { BunPlugin } from 'bun'
import { dts } from 'bun-plugin-dtsx'

// bunfig bundles a logger whose log encryption, gzip rotation and stream
// piping import node:crypto, node:zlib and Node streams up front - about 10 ms
// of every run that has a config file - though loading a config calls none of
// them. Inside bunfig those imports resolve to stand-ins that load the real
// module on first call. Only functions are imported from these modules there
// (test/core/build-lazy-builtins.test.ts checks), so the stand-ins behave the same.
export const LAZY_BUILTINS: Record<string, string[]> = {
  'crypto': ['createCipheriv', 'createDecipheriv', 'randomBytes'],
  'zlib': ['createGzip'],
  'stream/promises': ['pipeline'],
}

const BUNFIG_ENTRY = /[/\\]node_modules[/\\]bunfig[/\\]dist[/\\]index\.js$/

const lazyBuiltins: BunPlugin = {
  name: 'lazy-builtins',
  setup(build) {
    // Built-ins resolve before plugins see them, so bunfig's imports of them
    // are renamed on load and those names resolved here.
    build.onLoad({ filter: BUNFIG_ENTRY }, async args => ({
      contents: (await Bun.file(args.path).text())
        .replace(/ from "(crypto|zlib|stream\/promises)";/g, ' from "lazy-builtin:$1";'),
      loader: 'js',
    }))
    build.onResolve({ filter: /^lazy-builtin:/ }, args => ({ path: args.path.slice('lazy-builtin:'.length), namespace: 'lazy-builtin' }))
    build.onLoad({ filter: /.*/, namespace: 'lazy-builtin' }, args => ({
      contents: LAZY_BUILTINS[args.path]!
        .map(name => `export function ${name}(...args) { return require('node:${args.path}').${name}(...args) }`)
        .join('\n'),
      loader: 'js',
    }))
  },
}

if (import.meta.main) {
  // pickier-disable-next-line ts/no-top-level-await
  await Bun.build({
    entrypoints: ['src/index.ts', 'bin/cli.ts', 'src/lint-worker.ts'],
    outdir: './dist',
    target: 'bun',
    minify: true,
    splitting: true,
    plugins: [lazyBuiltins, dts()],
  })
}
