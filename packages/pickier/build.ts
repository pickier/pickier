import { dts } from 'bun-plugin-dtsx'

// pickier-disable-next-line ts/no-top-level-await
await Bun.build({
  entrypoints: ['src/index.ts', 'bin/cli.ts'],
  outdir: './dist',
  target: 'bun',
  plugins: [dts()],
})
