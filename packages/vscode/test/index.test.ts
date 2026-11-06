/* eslint-disable no-console */
import { describe, expect, it, mock } from 'bun:test'
import { createVscodeMock } from './utils/vscode-mock'

// Set up mocks before importing
mock.module('vscode', () => createVscodeMock())
mock.module('pickier', () => ({
  defaultConfig: {},
  formatCode: (t: string) => t,
  lintText: async () => [],
  runLintProgrammatic: async () => ({ errors: 0, warnings: 0, issues: [] }),
  runLint: async () => { console.log(JSON.stringify({ errors: 0, warnings: 0, issues: [] })) },
}))
mock.module('bunfig', () => ({
  loadConfig: async (opts: any) => opts.defaultConfig || {},
}))

describe('index exports', () => {
  it('exports formatting provider', async () => {
    const { PickierFormattingProvider } = await import('../src/formatter')
    expect(typeof PickierFormattingProvider).toBe('function')
  })

  it('exports diagnostic provider', async () => {
    const { PickierDiagnosticProvider } = await import('../src/diagnostics')
    expect(typeof PickierDiagnosticProvider).toBe('function')
  })

  it('exports status bar', async () => {
    const { PickierStatusBar } = await import('../src/status-bar')
    expect(typeof PickierStatusBar).toBe('function')
  })

  it('exports config functions', async () => {
    const { getPickierConfig } = await import('../src/config')
    expect(typeof getPickierConfig).toBe('function')
  })

  it('exports command functions', async () => {
    const { organizeImports } = await import('../src/commands')
    expect(typeof organizeImports).toBe('function')
  })

  // Note: Extension tests are in extension.test.ts to avoid circular dependencies
})
