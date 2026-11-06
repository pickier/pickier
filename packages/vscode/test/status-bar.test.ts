import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { PickierStatusBar } from '../src/status-bar'

import { createVscodeMock } from './utils/vscode-mock'

// Mock VS Code API before importing module
mock.module('vscode', () => createVscodeMock())

describe('PickierStatusBar', () => {
  beforeEach(() => {
    mock.restore()
    mock.module('vscode', () => createVscodeMock())
  })

  it('shows the status bar item on construct', async () => {
    const vscode = await import('vscode')
    const item = vscode.window.createStatusBarItem()
    const bar = new PickierStatusBar()
    expect(item.show).toHaveBeenCalled()
    bar.dispose()
  })

  it('updates to show for supported language', async () => {
    const vscode = await import('vscode')
    const item = vscode.window.createStatusBarItem()
    const bar = new PickierStatusBar()
    bar.update({ languageId: 'typescript' } as any)
    expect(item.text).toContain('Pickier')
    expect(item.show).toHaveBeenCalled()
  })

  it('hides for unsupported language', async () => {
    const vscode = await import('vscode')
    const item = vscode.window.createStatusBarItem()
    const bar = new PickierStatusBar()
    bar.update({ languageId: 'python' } as any)
    expect(item.hide).toHaveBeenCalled()
  })

  it('hides when extension disabled', async () => {
    mock.restore()
    mock.module('vscode', () => {
      return createVscodeMock({
        workspace: {
          getConfiguration: () => ({ get: (k: string, d: any) => (k.endsWith('enable') ? false : d) }),
        },
        window: createVscodeMock().window,
        languages: createVscodeMock().languages,
      })
    })
    const vscode = await import('vscode')
    const item = vscode.window.createStatusBarItem()
    const bar = new (await import('../src/status-bar')).PickierStatusBar()
    bar.update({ languageId: 'typescript' } as any)
    expect(item.hide).toHaveBeenCalled()
  })
})
