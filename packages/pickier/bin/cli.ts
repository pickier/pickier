#!/usr/bin/env bun

import process from 'node:process'

// ---------------------------------------------------------------------------
// Ultra-fast path: parse process.argv directly for common format commands
// Avoids importing @stacksjs/clapp (424K, 3909 lines) on the hot path.
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)

if (argv[0] === 'run') {
  let mode = 'auto'
  let check = false
  let write = false
  let config: string | undefined
  let verbose = false
  const globs: string[] = []

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mode') { mode = argv[++i] || 'auto'; continue }
    if (a === '--check') { check = true; continue }
    if (a === '--write') { write = true; continue }
    if (a === '--config') { config = argv[++i]; continue }
    if (a === '--verbose') { verbose = true; continue }
    // If we hit lint-only flags, break out and fall through to full CLI
    if (a === '--fix' || a === '--dry-run' || a === '--reporter' || a === '--max-warnings' || a === '--cache') {
      // needs full CLI framework
      globs.length = 0
      break
    }
    if (a === '--ext') { i++; continue } // skip ext value, handled by runUnified
    if (a === '--ignore-path') { i++; continue }
    if (a.startsWith('--')) continue
    globs.push(a)
  }

  if (globs.length > 0 && (mode === 'format' || mode === 'auto')) {
    const { runUnified } = await import('../src/run.ts')
    const code = await runUnified(globs, { mode: mode as any, check, write, config, verbose } as any)
    process.exit(code)
  }
}

// ---------------------------------------------------------------------------
// Full CLI: import framework for complex commands, help, version, etc.
// ---------------------------------------------------------------------------
// pickier-disable-next-line ts/no-top-level-await
const { CLI } = await import('@stacksjs/clapp')
// pickier-disable-next-line ts/no-top-level-await
const { version } = await import('../package.json')
// pickier-disable-next-line ts/no-top-level-await
const { runUnified: run } = await import('../src/run.ts')

type RunOptions = import('../src/run.ts').RunOptions

const cli = new CLI('pickier')

cli
  .command('run [...globs]', 'Run Pickier in unified mode (auto, lint, or format)')
  .option('--mode <mode>', 'auto|lint|format', { default: 'auto' })
  .option('--fix', 'Auto-fix problems (lint mode)')
  .option('--dry-run', 'Simulate fixes without writing (lint mode)')
  .option('--max-warnings <n>', 'Max warnings before non-zero exit (lint mode)', { default: -1 })
  .option('--reporter <name>', 'stylish|json|compact (lint mode)', { default: 'stylish' })
  .option('--write', 'Write changes to files (format mode)')
  .option('--check', 'Check without writing (format mode)')
  .option('--config <path>', 'Path to pickier config')
  .option('--ignore-path <file>', 'Ignore file (like .gitignore)')
  .option('--ext <exts>', 'Comma-separated extensions (uses config if not specified)')
  .option('--cache', 'Enable cache (lint mode)')
  .option('--verbose', 'Verbose output')
  .example('pickier run . --mode auto')
  .example('pickier run src --mode lint --fix')
  .example('pickier run "**/*.{ts,tsx,js}" --mode format --write')
  .action(async (globs: string[], opts: RunOptions) => {
    const code = await run(globs, opts)
    process.exit(code)
  })

cli
  .command('lint [...globs]', 'Lint files')
  .option('--fix', 'Auto-fix problems')
  .option('--dry-run', 'Simulate fixes without writing')
  .option('--max-warnings <n>', 'Max warnings before non-zero exit', { default: -1 })
  .option('--reporter <name>', 'stylish|json|compact', { default: 'stylish' })
  .option('--config <path>', 'Path to pickier config')
  .option('--ignore-path <file>', 'Ignore file (like .gitignore)')
  .option('--ext <exts>', 'Comma-separated extensions (uses config if not specified)')
  .option('--cache', 'Enable cache')
  .option('--verbose', 'Verbose output')
  .example('pickier lint . --dry-run')
  .example('pickier lint src --fix')
  .example('pickier lint "src/**/*.{ts,tsx}" --reporter json')
  .action(async (globs: string[], opts: RunOptions) => {
    const code = await run(globs, { ...opts, mode: 'lint' })
    process.exit(code)
  })

cli
  .command('format [...globs]', 'Format files')
  .option('--write', 'Write changes to files')
  .option('--check', 'Check without writing')
  .option('--config <path>', 'Path to pickier config')
  .option('--ignore-path <file>', 'Ignore file')
  .option('--ext <exts>', 'Comma-separated extensions (uses config if not specified)')
  .option('--verbose', 'Verbose output')
  .example('pickier format . --check')
  .example('pickier format src --write')
  .example('pickier format "**/*.{ts,tsx,js}" --write')
  .action(async (globs: string[], opts: RunOptions) => {
    const code = await run(globs, { ...opts, mode: 'format' })
    process.exit(code)
  })

cli.command('version', 'Show the version of the CLI').action(() => {
  console.log(version)
})

// default help when no command is provided
cli.command('', 'Show help').action(() => {
  cli.help()
})

cli.version(version)
cli.help()
cli.parse()
