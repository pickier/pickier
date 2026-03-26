import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tempFiles: string[] = []

export function createTempFile(content: string, suffix = '.sh'): string {
  const tempPath = resolve(__dirname, `temp-shell-${Date.now()}-${Math.random().toString(36).substring(7)}${suffix}`)
  writeFileSync(tempPath, content)
  tempFiles.push(tempPath)
  return tempPath
}

export function createConfigWithShellRules(rules: Record<string, string | [string, any]>): string {
  const configPath = resolve(__dirname, `temp-config-${Date.now()}-${Math.random().toString(36).substring(7)}.json`)
  const allShellRulesOff: Record<string, string> = {
    'shell/command-substitution': 'off',
    'shell/quote-variables': 'off',
    'shell/no-cd-without-check': 'off',
    'shell/no-eval': 'off',
    'shell/no-useless-cat': 'off',
    'shell/shebang': 'off',
    'shell/indent': 'off',
    'shell/function-style': 'off',
    'shell/operator-spacing': 'off',
    'shell/keyword-spacing': 'off',
    'shell/no-trailing-semicolons': 'off',
    'shell/no-trailing-whitespace': 'off',
    'shell/prefer-double-brackets': 'off',
    'shell/set-options': 'off',
    'shell/prefer-printf': 'off',
    'shell/consistent-case-terminators': 'off',
    'shell/no-broken-redirect': 'off',
    'shell/heredoc-indent': 'off',
    'shell/no-ls-parsing': 'off',
    'shell/no-variable-in-single-quotes': 'off',
    'shell/no-exit-in-subshell': 'off',
  }
  writeFileSync(configPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['sh', 'bash', 'zsh'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['sh', 'bash', 'zsh'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    pluginRules: { ...allShellRulesOff, ...rules },
  }, null, 2))
  tempFiles.push(configPath)
  return configPath
}

export function cleanupTempFiles(): void {
  for (const file of tempFiles) {
    if (existsSync(file))
      unlinkSync(file)
  }
  tempFiles.length = 0
}
