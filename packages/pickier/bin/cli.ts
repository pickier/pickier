#!/usr/bin/env bun

import process from 'node:process'
import { CLI } from '@stacksjs/clapp'
import { version } from '../package.json'
import { runUnified } from '../src/run.ts'

import type { RunOptions } from '../src/run.ts'

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
  .action(async (globs: string[], opts: RunOptions & { format?: boolean }) => {
    if (globs.length === 0) {
      cli.outputHelp()
      return
    }

    let mode: 'lint' | 'format'
    if (opts.format) {
      mode = 'format'
      if (!opts.check) opts.write = true
    }
    else {
      mode = 'lint'
    }

    const code = await runUnified(globs, { ...opts, mode })
    process.exit(code)
  })

// Lint command
cli
  .command('lint [...globs]', 'Lint files')
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
  .action(async (globs: string[], opts: RunOptions) => {
    const code = await runUnified(globs, { ...opts, mode: 'lint' })
    process.exit(code)
  })

// Format command
cli
  .command('format [...globs]', 'Format files')
  .option('--write', 'Write changes to files')
  .option('--check', 'Check without writing (CI-friendly)')
  .option('--config <path>', 'Path to pickier config')
  .option('--ignore-path <file>', 'Ignore file')
  .option('--ext <exts>', 'Comma-separated extensions')
  .option('--verbose', 'Verbose output')
  .example('pickier format . --write')
  .example('pickier format . --check')
  .action(async (globs: string[], opts: RunOptions) => {
    const code = await runUnified(globs, { ...opts, mode: 'format' })
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
  .action(async (globs: string[], opts: RunOptions) => {
    const code = await runUnified(globs, opts)
    process.exit(code)
  })

cli.command('version', 'Show the version of the CLI').action(() => {
  console.log(version)
})

cli.version(version)
cli.help()
cli.parse()
