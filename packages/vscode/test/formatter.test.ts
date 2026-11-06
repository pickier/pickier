import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { PickierFormattingProvider } from '../src/formatter'

import { createVscodeMock } from './utils/vscode-mock'

// Set up mocks BEFORE importing from source
mock.module('vscode', () => createVscodeMock())

mock.module('pickier', () => ({
  defaultConfig: { semi: false },
  formatCode: (text: string) => text.toUpperCase(),
}))

mock.module('bunfig', () => ({
  loadConfig: async (opts: any) => opts.defaultConfig || {},
}))

function makeDoc(text: string, fileName = '/workspace/file.ts'): any {
  return {
    fileName,
    getText: (range?: any) => (range ? text : text),
    positionAt: (o: number) => ({ line: 0, character: o }),
  }
}

describe('PickierFormattingProvider', () => {
  beforeEach(() => {
    mock.restore()
    mock.module('vscode', () => createVscodeMock())
    mock.module('pickier', () => ({
      defaultConfig: { semi: false },
      formatCode: (text: string) => text.toUpperCase(),
    }))
    mock.module('bunfig', () => ({
      loadConfig: async (opts: any) => opts.defaultConfig || {},
    }))
  })

  it('returns empty edits when text unchanged', async () => {
    mock.module('pickier', () => ({
      defaultConfig: {},
      formatCode: (text: string) => text,
    }))
    const provider = new PickierFormattingProvider()
    const vscode = await import('vscode')
    const edits = await provider.provideDocumentFormattingEdits(
      makeDoc('same'),
      {} as any,
      new vscode.CancellationTokenSource().token,
    )
    expect(edits).toEqual([])
  })

  it('returns a full document replacement when formatted differs', async () => {
    const provider = new PickierFormattingProvider()
    const vscode = await import('vscode')
    const edits = await provider.provideDocumentFormattingEdits(
      makeDoc('hello'),
      {} as any,
      new vscode.CancellationTokenSource().token,
    )
    expect(edits).toHaveLength(1)
    expect(edits[0].newText).toBe('HELLO')
  })

  it('range formatting returns range replacement when differs', async () => {
    const provider = new PickierFormattingProvider()
    const vscode = await import('vscode')
    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5))
    const edits = await provider.provideDocumentRangeFormattingEdits(
      makeDoc('hello world'),
      range,
      {} as any,
      new vscode.CancellationTokenSource().token,
    )
    expect(edits).toHaveLength(1)
    expect(edits[0].newText).toBe('HELLO WORLD')
  })
})
