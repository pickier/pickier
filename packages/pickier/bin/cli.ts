#!/usr/bin/env bun

import process from 'node:process'

// ---------------------------------------------------------------------------
// Fast-path argv parsing for format / auto commands
//
// For the common case of `pickier run . --mode format --write` (or auto mode),
// we parse process.argv directly and call runUnified via a dynamic import,
// bypassing the CLI framework entirely. This saves ~5ms on the hot path.
//
// Lint-only flags (--fix, --dry-run, --reporter, --max-warnings, --cache)
// fall through to the full CLI framework below.
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2)

  // Normalise: strip leading 'run' sub-command so both
  //   `pickier run . --mode format` and `pickier . --mode format` work.
  const startIdx = argv[0] === 'run' ? 1 : 0

  let mode = 'auto'
  let check = false
  let write = false
  let verbose = false
  let config: string | undefined
  const globs: string[] = []
  let useFastPath = true

  for (let i = startIdx; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mode') {
      mode = argv[++i] || 'auto'
    }
    else if (a === '--check') {
      check = true
    }
    else if (a === '--write') {
      write = true
    }
    else if (a === '--config') {
      config = argv[++i]
    }
    else if (a === '--verbose') {
      verbose = true
    }
    else if (a === '--ext' || a === '--ignore-path') {
      i++ // skip value
    }
    else if (a === '--fix' || a === '--dry-run' || a === '--reporter' || a === '--max-warnings' || a === '--cache') {
      // Lint-only flags — fall through to full CLI
      useFastPath = false
      globs.length = 0
      break
    }
    else if (a.startsWith('--')) {
      // Unknown flag — skip
    }
    else {
      globs.push(a)
    }
  }

  if (useFastPath && (mode === 'format' || mode === 'auto') && globs.length > 0) {
    const { runUnified } = await import('../src/run.ts')
    const code = await runUnified(globs, { mode: mode as 'format' | 'auto', check, write, verbose, config })
    process.exit(code)
  }

  // ---------------------------------------------------------------------------
  // Full CLI framework — handles lint mode, deprecated sub-commands, help, etc.
  // ---------------------------------------------------------------------------

  const { CLI } = await import('@stacksjs/clapp')
  const { version } = await import('../package.json')

  const cli = new CLI('pickier')

  // Default command: `pickier .` lints, `pickier . --format` formats
  cli
    .command('[...globs]', 'Lint files (default)')
    .option('--fix', 'Auto-fix lint problems')
    .option('--format', 'Format files instead of linting')
    .option('--dry-run', 'Simulate fixes without writing')
    .option('--check', 'Check formatting without writing (CI-friendly)')
    .option('--max-warnings <n>', 'Max warnings before non-zero exit', { default: -1 })
    .option('--reporter <name>', 'stylish|json|compact', { default: 'stylish' })
    .option('--config <path>', 'Path to pickier config')
    .option('--ignore-path <file>', 'Ignore file (like .gitignore)')
    .option('--ext <exts>', 'Comma-separated extensions')
    .option('--cache', 'Enable cache')
    .option('--verbose', 'Verbose output')
    .example('pickier .')
    .example('pickier . --fix')
    .example('pickier . --format')
    .example('pickier src --fix --verbose')
    .action(async (cmdGlobs: string[], opts: Record<string, unknown> & { format?: boolean }) => {
      if (cmdGlobs.length === 0) {
        cli.outputHelp()
        return
      }

      const { runUnified } = await import('../src/run.ts')
      let runMode: 'lint' | 'format'
      if (opts.format) {
        runMode = 'format'
        if (!opts.check) opts.write = true
      }
      else {
        runMode = 'lint'
      }

      const code = await runUnified(cmdGlobs, { ...(opts as Record<string, unknown>), mode: runMode } as Parameters<typeof runUnified>[1])
      process.exit(code)
    })

  // Deprecated lint command
  cli
    .command('lint [...globs]', '[DEPRECATION] Use `pickier [...globs]` instead. Lint files')
    .option('--fix', 'Auto-fix problems')
    .option('--dry-run', 'Simulate fixes without writing')
    .option('--max-warnings <n>', 'Max warnings before non-zero exit', { default: -1 })
    .option('--reporter <name>', 'stylish|json|compact', { default: 'stylish' })
    .option('--config <path>', 'Path to pickier config')
    .option('--ignore-path <file>', 'Ignore file (like .gitignore)')
    .option('--ext <exts>', 'Comma-separated extensions')
    .option('--cache', 'Enable cache')
    .option('--verbose', 'Verbose output')
    .example('pickier lint .')
    .example('pickier lint src --fix')
    .example('pickier lint "src/**/*.{ts,tsx}" --reporter json')
    .action(async (cmdGlobs: string[], opts: Record<string, unknown>) => {
      const { runUnified } = await import('../src/run.ts')
      const code = await runUnified(cmdGlobs, { ...opts, mode: 'lint' } as Parameters<typeof runUnified>[1])
      process.exit(code)
    })

  // Deprecated format command
  cli
    .command('format [...globs]', '[DEPRECATION] Use `pickier [...globs] --format` instead. Format files')
    .option('--write', 'Write changes to files')
    .option('--check', 'Check without writing (CI-friendly)')
    .option('--config <path>', 'Path to pickier config')
    .option('--ignore-path <file>', 'Ignore file')
    .option('--ext <exts>', 'Comma-separated extensions')
    .option('--verbose', 'Verbose output')
    .example('pickier format . --write')
    .example('pickier format . --check')
    .action(async (cmdGlobs: string[], opts: Record<string, unknown>) => {
      const { runUnified } = await import('../src/run.ts')
      const code = await runUnified(cmdGlobs, { ...opts, mode: 'format' } as Parameters<typeof runUnified>[1])
      process.exit(code)
    })

  // Run command (unified mode)
  cli
    .command('run [...globs]', 'Unified mode (auto, lint, or format)')
    .option('--mode <mode>', 'auto|lint|format', { default: 'auto' })
    .option('--fix', 'Auto-fix problems (lint mode)')
    .option('--dry-run', 'Simulate fixes without writing (lint mode)')
    .option('--max-warnings <n>', 'Max warnings before non-zero exit (lint mode)', { default: -1 })
    .option('--reporter <name>', 'stylish|json|compact (lint mode)', { default: 'stylish' })
    .option('--write', 'Write changes to files (format mode)')
    .option('--check', 'Check without writing (format mode)')
    .option('--config <path>', 'Path to pickier config')
    .option('--ignore-path <file>', 'Ignore file (like .gitignore)')
    .option('--ext <exts>', 'Comma-separated extensions')
    .option('--cache', 'Enable cache (lint mode)')
    .option('--verbose', 'Verbose output')
    .example('pickier run . --mode lint --fix')
    .example('pickier run . --mode format --write')
    .action(async (cmdGlobs: string[], opts: Record<string, unknown>) => {
      const { runUnified } = await import('../src/run.ts')
      const code = await runUnified(cmdGlobs, opts as Parameters<typeof runUnified>[1])
      process.exit(code)
    })

  cli.command('version', 'Show the version of the CLI').action(async () => {
    const { version: ver } = await import('../package.json')
    console.log(ver)
  })

  cli.version(version)
  cli.help()
  cli.parse()
}

main()
