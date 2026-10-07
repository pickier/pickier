# Programmatic Usage

Use Pickier programmatically in your own scripts and tools.

## Installation

```bash
bun add pickier
# or
npm install pickier
```

## Core Functions

### runLint()

Run the complete linting workflow with file globbing, scanning, and reporting.

```typescript
import type { LintOptions } from 'pickier'
import { runLint } from 'pickier'

async function lint() {
  const globs = ['src', 'scripts/**/*.{ts,js}']
  const options: LintOptions = {
    fix: true,
    dryRun: false,
    reporter: 'stylish',
    maxWarnings: 0,
    verbose: true,
  }

  // Returns exit code: 0 success, 1 errors/warnings exceeded
  const code = await runLint(globs, options)
  return code
}
```

**Options:**

- `fix: boolean` - Auto-fix problems
- `dryRun: boolean` - Simulate fixes without writing
- `reporter: 'stylish' | 'json' | 'compact'` - Output format
- `maxWarnings: number` - Maximum warnings before error exit (-1 disables)
- `config: string` - Path to config file
- `ignorePath: string` - Path to ignore file
- `ext: string` - Comma-separated extensions
- `cache: boolean` - Enable caching (reserved)
- `verbose: boolean` - Verbose output

### runLintProgrammatic()

Programmatic linting API that returns structured results instead of exit codes.

```typescript
import type { LintOptions } from 'pickier'
import { runLintProgrammatic } from 'pickier'

async function lintProgrammatic() {
  const globs = ['src/**/*.ts']
  const options: LintOptions = {
    fix: false,
    reporter: 'json',
  }

  // Returns structured result object
  const result = await runLintProgrammatic(globs, options)

  console.log(`Found ${result.errors} errors and ${result.warnings} warnings`)
  console.log(`Total issues: ${result.issues.length}`)

  // Process each issue
  for (const issue of result.issues) {
    console.log(`${issue.filePath}:${issue.line}:${issue.column}`)
    console.log(`  ${issue.severity}: ${issue.message} (${issue.ruleId})`)
  }

  return result
}
```

**Result Type:**

```typescript
interface LintResult {
  errors: number
  warnings: number
  issues: LintIssue[]
}

interface LintIssue {
  filePath: string
  line: number
  column: number
  ruleId: string
  message: string
  severity: 'error' | 'warn'
  help?: string
}
```

### lintText()

Lint a single string of code with optional cancellation support.

```typescript
import { lintText } from 'pickier'
import type { PickierConfig } from 'pickier'

async function lintString() {
  const code = `
    const x = 1
    console.log(x)
    debugger
  `

  const config: PickierConfig = {
    rules: {
      noDebugger: 'error',
      noConsole: 'warn',
    },
  }

  // Optional: AbortController for cancellation
  const controller = new AbortController()

  const issues = await lintText(code, config, 'test.ts', controller.signal)

  console.log(`Found ${issues.length} issues`)
  for (const issue of issues) {
    console.log(`Line ${issue.line}: ${issue.message}`)
  }

  return issues
}
```

**Cancellation Example:**

```typescript
const controller = new AbortController()

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000)

try {
  const issues = await lintText(code, config, 'test.ts', controller.signal)
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Linting was cancelled')
  }
}
```

### runFormat()

Run the complete formatting workflow with file globbing and writing.

```typescript
import type { FormatOptions } from 'pickier'
import { runFormat } from 'pickier'

async function format() {
  const globs = ['src', 'README.md']
  const options: FormatOptions = {
    write: true,
    check: false,
    ext: '.ts,.js,.md',
    verbose: true,
  }

  // Returns exit code: 0 success, 1 check failed
  const code = await runFormat(globs, options)
  return code
}
```

**Options:**

- `write: boolean` - Write changes to disk
- `check: boolean` - Check without writing
- `config: string` - Path to config file
- `ignorePath: string` - Path to ignore file
- `ext: string` - Comma-separated extensions
- `verbose: boolean` - Verbose output

**Note:** When neither `check` nor `write` is set, formatting runs in check mode.

### formatCode()

Format a single string of code.

```typescript
import { formatCode } from 'pickier'
import type { PickierConfig } from 'pickier'

function formatString() {
  const code = `const x="hello";console.log(x)`

  const config: PickierConfig = {
    format: {
      quotes: 'single',
      semi: false,
      indent: 2,
    },
  }

  const formatted = formatCode(code, config, 'test.ts')
  console.log(formatted)
  // Output: const x = 'hello'\nconsole.log(x)
}
```

### run()

Unified entry point that routes to lint or format mode.

```typescript
import { run } from 'pickier'

async function unified() {
  const globs = ['.']
  const options = {
    mode: 'lint', // 'auto' | 'lint' | 'format'
    fix: true,
    reporter: 'stylish',
  }

  const code = await run(globs, options)
  return code
}
```

## Configuration

### Loading Configuration

Pickier automatically loads configuration from project root:

```typescript
import { config } from 'pickier'

console.log(config.rules.noDebugger) // 'error'
console.log(config.format.quotes)     // 'single'
```

### Using Custom Configuration

```typescript
import type { PickierConfig } from 'pickier'

const customConfig: PickierConfig = {
  verbose: true,
  ignores: ['dist/**', 'build/**'],
  rules: {
    noDebugger: 'error',
    noConsole: 'warn',
  },
  pluginRules: {
    'style/curly': 'error',
    'ts/prefer-const': 'error',
  },
}

const code = await runLint(['.'], { config: './custom.config.ts' })
```

## Advanced Usage

### Parallel Linting with Concurrency Control

```typescript
import { runLintProgrammatic } from 'pickier'

async function lintParallel() {
  // Control concurrency with environment variable
  process.env.PICKIER_CONCURRENCY = '4'

  const result = await runLintProgrammatic(['src/**/*.ts'], {
    fix: true,
  })

  return result
}
```

### Batch Processing Multiple Directories

```typescript
async function lintMultiple() {
  const directories = ['src', 'tests', 'scripts']
  const results = []

  for (const dir of directories) {
    const result = await runLintProgrammatic([dir], {
      reporter: 'json',
    })
    results.push({ dir, result })
  }

  const totalErrors = results.reduce((sum, r) => sum + r.result.errors, 0)
  const totalWarnings = results.reduce((sum, r) => sum + r.result.warnings, 0)

  console.log(`Total: ${totalErrors} errors, ${totalWarnings} warnings`)
  return results
}
```

### Custom Reporter Integration

```typescript
async function customReporting() {
  const result = await runLintProgrammatic(['.'], {
    reporter: 'json',
  })

  // Send to custom logging service
  await sendToLoggingService({
    timestamp: new Date(),
    errors: result.errors,
    warnings: result.warnings,
    issues: result.issues,
  })

  // Generate custom report format
  const report = generateHTMLReport(result.issues)
  await writeFile('lint-report.html', report)
}
```

### CI/CD Integration

```typescript
async function ciLint() {
  // Fail on warnings in CI
  process.env.PICKIER_FAIL_ON_WARNINGS = '1'

  const result = await runLintProgrammatic(['.'], {
    fix: false,
    reporter: 'compact',
    maxWarnings: 0,
  })

  if (result.errors > 0) {
    console.error(`CI failed: ${result.errors} errors found`)
    process.exit(1)
  }

  console.log('CI passed: No errors found')
}
```

### Watching for Changes

```typescript
import { watch } from 'node:fs'
import { runLint } from 'pickier'

function watchLint() {
  const watcher = watch('./src', { recursive: true }, async (event, filename) => {
    if (filename?.endsWith('.ts')) {
      console.log(`File changed: ${filename}`)
      await runLint([`./src/${filename}`], {
        fix: true,
        reporter: 'compact',
      })
    }
  })

  console.log('Watching for changes...')

  // Cleanup
  process.on('SIGINT', () => {
    watcher.close()
    process.exit(0)
  })
}
```

### Error Handling

```typescript
async function lintWithErrorHandling() {
  try {
    const result = await runLintProgrammatic(['.'], {
      fix: false,
    })

    if (result.errors > 0) {
      throw new Error(`Linting failed with ${result.errors} errors`)
    }

    return result
  } catch (error) {
    if (error.message.includes('config')) {
      console.error('Configuration error:', error.message)
    } else if (error.message.includes('glob')) {
      console.error('File matching error:', error.message)
    } else {
      console.error('Unknown error:', error)
    }
    throw error
  }
}
```

## TypeScript Types

Pickier provides full TypeScript types for all APIs:

```typescript
import type {
  // Config types
  PickierConfig,
  PickierOptions,

  // Function option types
  LintOptions,
  FormatOptions,
  RunOptions,

  // Result types
  LintResult,
  LintIssue,

  // Rule types
  RuleModule,
  RuleContext,
  PickierPlugin,
} from 'pickier'
```

## Examples

### Example 1: Pre-commit Hook

```typescript
import { runLint } from 'pickier'
import { execSync } from 'node:child_process'

async function precommit() {
  // Get staged files
  const staged = execSync('git diff --cached --name-only --diff-filter=ACM')
    .toString()
    .trim()
    .split('\n')
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))

  if (staged.length === 0) {
    console.log('No files to lint')
    return 0
  }

  // Lint only staged files
  const code = await runLint(staged, {
    fix: true,
    reporter: 'stylish',
  })

  if (code !== 0) {
    console.error('Linting failed. Fix errors before committing.')
    process.exit(1)
  }

  // Re-stage fixed files
  for (const file of staged) {
    execSync(`git add ${file}`)
  }

  console.log('Pre-commit checks passed')
}
```

### Example 2: Custom Build Tool Integration

```typescript
import { runLint, runFormat } from 'pickier'

async function buildPipeline() {
  console.log('1. Formatting code...')
  const formatCode = await runFormat(['.'], {
    write: true,
    verbose: false,
  })

  if (formatCode !== 0) {
    throw new Error('Formatting failed')
  }

  console.log('2. Linting code...')
  const lintCode = await runLint(['.'], {
    fix: true,
    reporter: 'compact',
    maxWarnings: 0,
  })

  if (lintCode !== 0) {
    throw new Error('Linting failed')
  }

  console.log('3. Running tests...')
  // ... test runner

  console.log('Build pipeline completed successfully')
}
```

### Example 3: Documentation Generator

```typescript
import { runLintProgrammatic } from 'pickier'

async function generateDocs() {
  const result = await runLintProgrammatic(['src/**/*.ts'], {
    reporter: 'json',
  })

  // Group issues by rule
  const byRule = new Map<string, typeof result.issues>()
  for (const issue of result.issues) {
    const rules = byRule.get(issue.ruleId) || []
    rules.push(issue)
    byRule.set(issue.ruleId, rules)
  }

  // Generate markdown report
  let markdown = '# Lint Report\n\n'
  for (const [rule, issues] of byRule) {
    markdown += `## ${rule} (${issues.length} issues)\n\n`
    for (const issue of issues) {
      markdown += `- ${issue.filePath}:${issue.line} - ${issue.message}\n`
    }
    markdown += '\n'
  }

  await writeFile('lint-report.md', markdown)
}
```

## Best Practices

1. **Use runLintProgrammatic() for tooling** - Returns structured data instead of exit codes
2. **Handle AbortSignal** - Support cancellation in long-running operations
3. **Configure environment variables** - Control behavior without changing code
4. **Batch operations** - Process multiple directories efficiently
5. **Error handling** - Catch and handle different error types appropriately
6. **Type safety** - Use TypeScript types for better developer experience

## See Also

- [Configuration](/config) - Configure Pickier
- [CLI Reference](/cli) - Command-line usage
- [API Reference](/api/reference) - Complete API documentation
