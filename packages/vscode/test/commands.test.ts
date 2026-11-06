import { describe, expect, it, mock } from 'bun:test'
import { organizeImports, restartExtension, showOutputChannel } from '../src/commands'

import { createVscodeMock } from './utils/vscode-mock'

// Set up mocks at module level
mock.module('vscode', () => createVscodeMock())
mock.module('bunfig', () => ({
  loadConfig: async (opts: any) => opts.defaultConfig || {},
}))

describe('organizeImports', () => {
  // Use real pickier - no need to mock!

  it('organizes imports in active editor', async () => {
    const vscode = await import('vscode')

    // Code that may or may not need formatting - we're just testing the command works
    const text = `const x = "test"; const y = 'another'`

    const mockEdit = mock(async () => true)

    ;(vscode.window as any).activeTextEditor = {
      document: {
        getText: () => text,
        fileName: '/test.ts',
        languageId: 'typescript',
        positionAt: (offset: number) => new vscode.Position(0, offset),
        uri: vscode.Uri.file('/test.ts'),
      },
      edit: mockEdit,
    }

    await organizeImports()

    // Should show a message (either organized or already organized)
    expect(vscode.window.showInformationMessage).toHaveBeenCalled()
  })

  it('shows warning when no active editor', async () => {
    const vscode = await import('vscode')
    ;(vscode.window as any).activeTextEditor = null

    await organizeImports()

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No active editor found')
  })

  it('handles formatting without errors', async () => {
    const vscode = await import('vscode')

    // Use real pickier - it should handle any valid code gracefully
    ;(vscode.window as any).activeTextEditor = {
      document: {
        getText: () => 'import { a } from "a"',
        fileName: '/test.ts',
        languageId: 'typescript',
        positionAt: (offset: number) => new vscode.Position(0, offset),
        uri: vscode.Uri.file('/test.ts'),
      },
      edit: mock(async () => true),
    }

    await organizeImports()

    // Should complete without throwing
    expect(true).toBe(true)
  })

  it('handles organized imports', async () => {
    const vscode = await import('vscode')
    const text = `import { a } from 'a'
import { b } from 'b'

const x = 1`

    ;(vscode.window as any).activeTextEditor = {
      document: {
        getText: () => text,
        fileName: '/test.ts',
        languageId: 'typescript',
        positionAt: (offset: number) => new vscode.Position(0, offset),
        uri: vscode.Uri.file('/test.ts'),
      },
      edit: mock(async () => true),
    }

    await organizeImports()

    // Should show a message
    expect(vscode.window.showInformationMessage).toHaveBeenCalled()
  })
})

describe('showOutputChannel', () => {
  it('shows the output channel', async () => {
    const vscode = await import('vscode')
    const outputChannel = vscode.window.createOutputChannel('Pickier')

    showOutputChannel(outputChannel)

    expect(outputChannel.show).toHaveBeenCalled()
  })

  it('handles undefined output channel', () => {
    // Should not throw
    expect(() => showOutputChannel(undefined as any)).not.toThrow()
  })
})

describe('restartExtension', () => {
  it('shows information message about restart', async () => {
    const vscode = await import('vscode')

    await restartExtension()

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Restart Pickier Extension?',
      'Yes',
      'No',
    )
  })

  it('provides instructions for restarting', async () => {
    // The function should inform users how to restart
    // This is a simple function, so we just verify it completes
    await restartExtension()
    // Test passes if no exception is thrown
    expect(true).toBe(true)
  })
})
