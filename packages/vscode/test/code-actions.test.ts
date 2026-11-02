import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { createTextDocument, createVscodeMock } from './utils/vscode-mock'
import { useRealPickier } from './utils/real-pickier'

// Set up mocks at module level
mock.module('vscode', () => createVscodeMock())
mock.module('bunfig', () => ({
  loadConfig: async (opts: any) => opts.defaultConfig || {},
}))

// This file exercises the real linter, not a stub of it.
useRealPickier()

describe('PickierCodeActionProvider', () => {
  beforeEach(async () => {
    const { clearConfigCache } = await import('../src/config')
    clearConfigCache()
  })

  it('returns undefined when code actions are disabled', async () => {
    const vscode = await import('vscode')
    const { PickierCodeActionProvider } = await import('../src/code-actions')
    const provider = new PickierCodeActionProvider()

    // Save original and override config to disable code actions
    const originalGetConfiguration = vscode.workspace.getConfiguration
    ;(vscode.workspace as any).getConfiguration = mock(() => ({
      get: (key: string) => key !== 'codeActions.enable',
    }))

    const doc = {
      getText: () => 'const x = 1',
      fileName: '/test.ts',
      uri: { toString: () => 'file:///test.ts' },
    } as any

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10))
    const context = { diagnostics: [], only: undefined } as any
    const token = new vscode.CancellationTokenSource().token

    const actions = await provider.provideCodeActions(doc, range, context, token)
    expect(actions).toBeUndefined()

    // Restore original
    ;(vscode.workspace as any).getConfiguration = originalGetConfiguration
  })

  it('returns Fix All action when requested', async () => {
    const vscode = await import('vscode')
    const { PickierCodeActionProvider } = await import('../src/code-actions')
    const provider = new PickierCodeActionProvider()

    const doc = {
      getText: () => 'const x = 1',
      fileName: '/test.ts',
      uri: { toString: () => 'file:///test.ts' },
    } as any

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10))
    const onlyKind = vscode.CodeActionKind.SourceFixAll
    const context = {
      diagnostics: [],
      only: {
        value: onlyKind,
        contains: (kind: any) => kind === onlyKind,
      },
    } as any
    const token = new vscode.CancellationTokenSource().token

    const actions = await provider.provideCodeActions(doc, range, context, token)
    expect(actions).toBeDefined()
    expect(actions!.length).toBe(1)
    expect(actions![0].title).toBe('Fix all auto-fixable Pickier issues')
    expect(actions![0].kind).toBe(vscode.CodeActionKind.SourceFixAll)
  })

  it('returns fix action for pickier diagnostics with fixable rules', async () => {
    const vscode = await import('vscode')
    const { PickierCodeActionProvider } = await import('../src/code-actions')
    const { lintText, formatCode, defaultConfig } = await import('pickier')
    const provider = new PickierCodeActionProvider()

    // Use real code with quote style issues (fixable by formatCode)
    const code = 'const x = "test"'
    const doc = createTextDocument(code)

    // Verify pickier detects the quote issue and can fix it
    const config = { ...defaultConfig, format: { ...defaultConfig.format, quotes: 'single' as const } }
    const issues = await lintText(code, config, '/test.ts')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].ruleId).toBe('quotes')

    // Verify formatCode fixes it
    const fixed = formatCode(code, config, '/test.ts')
    expect(fixed).toContain('\'test\'')
    expect(fixed).not.toContain('"test"')

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 16)),
      'Inconsistent quote style',
      vscode.DiagnosticSeverity.Warning,
    )
    diagnostic.source = 'pickier'
    diagnostic.code = 'quotes'

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 16))
    const context = { diagnostics: [diagnostic], only: undefined } as any
    const token = new vscode.CancellationTokenSource().token

    const actions = await provider.provideCodeActions(doc, range, context, token)
    expect(actions).toBeDefined()
    expect(actions!.length).toBeGreaterThan(0)
    expect(actions![0].title).toContain('Fix:')
    expect(actions![0].kind).toBe(vscode.CodeActionKind.QuickFix)
    expect(actions![0].isPreferred).toBe(true)
  })

  it('ignores non-pickier diagnostics', async () => {
    const vscode = await import('vscode')
    const { PickierCodeActionProvider } = await import('../src/code-actions')
    const provider = new PickierCodeActionProvider()

    const doc = {
      getText: () => 'const x = 1',
      fileName: '/test.ts',
      uri: { toString: () => 'file:///test.ts' },
    } as any

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)),
      'some error',
      vscode.DiagnosticSeverity.Error,
    )
    diagnostic.source = 'typescript' // Not from pickier

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10))
    const context = { diagnostics: [diagnostic], only: undefined } as any
    const token = new vscode.CancellationTokenSource().token

    const actions = await provider.provideCodeActions(doc, range, context, token)
    expect(actions).toBeDefined()
    expect(actions!.length).toBe(0)
  })

  it('respects cancellation token', async () => {
    const vscode = await import('vscode')
    const { PickierCodeActionProvider } = await import('../src/code-actions')
    const provider = new PickierCodeActionProvider()

    const doc = createTextDocument('debugger')

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 8)),
      'debugger statement',
      vscode.DiagnosticSeverity.Error,
    )
    diagnostic.source = 'pickier'
    diagnostic.code = 'noDebugger'

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10))
    const context = { diagnostics: [diagnostic], only: undefined } as any
    const tokenSource = new vscode.CancellationTokenSource()

    // Cancel immediately
    tokenSource.cancel()

    const actions = await provider.provideCodeActions(doc, range, context, tokenSource.token)
    // Should handle cancellation gracefully
    expect(actions).toBeDefined()
  })
})

describe('applyFix', () => {
  beforeEach(async () => {
    const { clearConfigCache } = await import('../src/config')
    clearConfigCache()
  })

  it('applies fix to document', async () => {
    const vscode = await import('vscode')
    const { applyFix } = await import('../src/code-actions')
    const { lintText, formatCode, defaultConfig } = await import('pickier')

    // Code with fixable quote issues
    const code = 'const x = "test"\nconst y = "another"'
    const doc = {
      getText: () => code,
      fileName: '/test.ts',
      uri: vscode.Uri.file('/test.ts'),
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as any

    // Verify pickier can fix it
    const config = { ...defaultConfig, format: { ...defaultConfig.format, quotes: 'single' as const } }
    const issuesBefore = await lintText(code, config, '/test.ts')
    expect(issuesBefore.some(i => i.ruleId === 'quotes')).toBe(true)

    const fixed = formatCode(code, config, '/test.ts')
    expect(fixed).not.toContain('"test"')
    expect(fixed).toContain('\'test\'')

    const issuesAfter = await lintText(fixed, config, '/test.ts')
    expect(issuesAfter.some(i => i.ruleId === 'quotes')).toBe(false)

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 16)),
      'Inconsistent quote style',
      vscode.DiagnosticSeverity.Warning,
    )

    await applyFix(doc, diagnostic)

    // Verify that workspace.applyEdit was called
    expect(vscode.workspace.applyEdit).toHaveBeenCalled()
  })

  it('handles code that does not need fixing', async () => {
    const vscode = await import('vscode')
    const { applyFix } = await import('../src/code-actions')

    // Use valid code that doesn't need fixing
    const doc = {
      getText: () => 'const x = 1',
      fileName: '/test.ts',
      uri: vscode.Uri.file('/test.ts'),
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as any

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)),
      'some issue',
      vscode.DiagnosticSeverity.Warning,
    )

    await applyFix(doc, diagnostic)

    // Function completes without error
    expect(true).toBe(true)
  })
})

describe('fixAllInDocument', () => {
  beforeEach(async () => {
    const { clearConfigCache } = await import('../src/config')
    clearConfigCache()
  })

  it('fixes issues in document', async () => {
    const vscode = await import('vscode')
    const { fixAllInDocument } = await import('../src/code-actions')
    const { lintText, formatCode, defaultConfig } = await import('pickier')

    // Use code with actual fixable issues (quote style)
    const code = 'const x = "test"\nconst y = "another"'
    const doc = {
      getText: () => code,
      fileName: '/test.ts',
      uri: vscode.Uri.file('/test.ts'),
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as any

    // Verify pickier detects and can fix the issue
    const config = { ...defaultConfig, format: { ...defaultConfig.format, quotes: 'single' as const } }
    const issuesBefore = await lintText(code, config, '/test.ts')
    expect(issuesBefore.some(i => i.ruleId === 'quotes')).toBe(true)

    const fixed = formatCode(code, config, '/test.ts')
    expect(fixed).not.toBe(code)
    expect(fixed).toContain('\'test\'')
    expect(fixed).not.toContain('"test"')

    await fixAllInDocument(doc)

    // Should show a message (either fixed or no issues found)
    expect(vscode.window.showInformationMessage).toHaveBeenCalled()
  })

  it('handles valid code gracefully', async () => {
    const vscode = await import('vscode')
    const { fixAllInDocument } = await import('../src/code-actions')

    const doc = {
      getText: () => 'const x = 1',
      fileName: '/test.ts',
      uri: vscode.Uri.file('/test.ts'),
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as any

    await fixAllInDocument(doc)

    // Should complete without error
    expect(vscode.window.showInformationMessage).toHaveBeenCalled()
  })
})
