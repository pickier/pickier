process.stdout.write('Building...\n')

// pickier-disable-next-line ts/no-top-level-await
await Bun.build({
  entrypoints: ['src/extension.ts'],
  outdir: './dist',
  splitting: false,
  external: ['vscode'],
  target: 'node',
  format: 'esm',
})

process.stdout.write('Built successfully!\n')

export {}
