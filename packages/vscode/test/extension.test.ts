/* eslint-disable no-console */
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { createVscodeMock } from './utils/vscode-mock'

// Set up mocks at module level to ensure they're applied before any imports
mock.module('vscode', () => createVscodeMock())
mock.module('pickier', () => ({
  defaultConfig: {},
  formatCode: (t: string) => t,
  lintText: async () => [],
  runLintProgrammatic: async (_paths: string[]) => ({ errors: 0, warnings: 0, issues: [] }),
  runLint: async () => { console.log(JSON.stringify({ errors: 0, warnings: 0, issues: [] })) },
}))
mock.module('bunfig', () => ({
  loadConfig: async (opts: any) => opts.defaultConfig || {},
}))

// Mock VS Code and pickier before importing extension
function setupVscodeMock(overrides: any = {}) {
  mock.module('vscode', () => createVscodeMock(overrides))
}

function setupPickierMock() {
  mock.module('pickier', () => ({
    defaultConfig: {},
    formatCode: (t: string) => t,
    lintText: async () => [],
    runLintProgrammatic: async (_paths: string[]) => ({ errors: 0, warnings: 0, issues: [] }),
    runLint: async () => { console.log(JSON.stringify({ errors: 0, warnings: 0, issues: [] })) },
  }))
}

function setupBunfigMock() {
  mock.module('bunfig', () => ({
    loadConfig: async (opts: any) => opts.defaultConfig || {},
  }))
}

describe('extension activate/deactivate', () => {
  beforeEach(() => {
    mock.restore()
    setupVscodeMock()
    setupPickierMock()
    setupBunfigMock()
  })

  it('activates: registers commands, providers, and sets up initial state', async () => {
    const vscode = await import('vscode')
    const context = { subscriptions: [] as any[] } as any

    // Import activate function dynamically to avoid circular dependency
    const { activate } = await import('../src/extension')

    await activate(context)

    // Commands registered
    expect(vscode.commands.registerCommand).toHaveBeenCalled()

    // Diagnostic collection created
    expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith('pickier')

    // Status bar created
    expect(vscode.window.createStatusBarItem).toHaveBeenCalled()

    // Subscriptions populated
    expect(context.subscriptions.length).toBeGreaterThan(5)
  })

  it('deactivates: disposes resources and cancels tokens', async () => {
    const vscode = await import('vscode')
    const context = { subscriptions: [] as any[] } as any
    const { activate, deactivate } = await import('../src/extension')

    await activate(context)
    deactivate()

    // Output channel and status bar disposed
    const channel = (vscode.window as any).createOutputChannel.mock.results[0].value
    const bar = (vscode.window as any).createStatusBarItem.mock.results[0].value
    expect(channel.dispose).toHaveBeenCalled()
    expect(bar.dispose).toHaveBeenCalled()
  })

  it('command handlers run without throwing', async () => {
    const vscode = await import('vscode')
    const context = { subscriptions: [] as any[] } as any
    const { activate } = await import('../src/extension')

    await activate(context)

    // simulate active editor for format/lint commands
    ;(vscode.window as any).activeTextEditor = {
      document: {
        getText: () => 't',
        fileName: '/workspace/a.ts',
        languageId: 'typescript',
        positionAt: (o: number) => new vscode.Position(0, o),
        uri: { fsPath: '/workspace/a.ts', toString: () => 'file:///workspace/a.ts' },
      },
      selection: { isEmpty: true },
      edit: async () => true,
    }

    // run commands
    await (vscode.commands as any)._invoke('pickier.lint')
    await (vscode.commands as any)._invoke('pickier.lintWorkspace')
    await (vscode.commands as any)._invoke('pickier.format')

    expect(true).toBe(true)
  })
})
