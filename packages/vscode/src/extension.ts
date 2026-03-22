import * as vscode from 'vscode'
import { PickierCodeLensProvider } from './codelens'
import { organizeImports, restartExtension, showOutputChannel } from './commands'
import { clearConfigCache, disposeConfigWatcher, getPickierConfig, watchConfigFile } from './config'
import { lintPathsToDiagnostics, PickierDiagnosticProvider } from './diagnostics'
import { PickierFormattingProvider } from './formatter'
import { PickierHoverProvider } from './hover'
import { PickierStatusBar } from './status-bar'

let diagnosticCollection: vscode.DiagnosticCollection
let statusBarItem: PickierStatusBar
let outputChannel: vscode.OutputChannel
const changeDebounceTimers = new Map<string, NodeJS.Timeout>()
const lintTokenSources = new Map<string, vscode.CancellationTokenSource>()

function resetLintToken(document: vscode.TextDocument): vscode.CancellationToken {
  const key = document.uri.toString()
  const existing = lintTokenSources.get(key)
  if (existing)
    existing.cancel()
  const cts = new vscode.CancellationTokenSource()
  lintTokenSources.set(key, cts)
  return cts.token
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('Pickier')
  outputChannel.appendLine('Pickier extension activated')

  // Create diagnostic collection
  diagnosticCollection = vscode.languages.createDiagnosticCollection('pickier')

  // Create status bar
  statusBarItem = new PickierStatusBar()

  // Register formatter provider
  const formattingProvider = new PickierFormattingProvider()

  // Register formatters for supported languages
  const supportedLanguages = ['typescript', 'javascript', 'json', 'jsonc', 'html', 'css', 'markdown', 'yaml']

  supportedLanguages.forEach((language) => {
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(language, formattingProvider),
      vscode.languages.registerDocumentRangeFormattingEditProvider(language, formattingProvider),
    )
  })

  // Register code actions provider (dynamic import to avoid circular dependency)
  const { PickierCodeActionProvider } = await import('./code-actions')
  const codeActionProvider = new PickierCodeActionProvider()
  supportedLanguages.forEach((language) => {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        language,
        codeActionProvider,
        {
          providedCodeActionKinds: PickierCodeActionProvider.providedCodeActionKinds,
        },
      ),
    )
  })

  // Register diagnostic provider
  const diagnosticProvider = new PickierDiagnosticProvider(diagnosticCollection, outputChannel)

  // Register hover provider
  const hoverProvider = new PickierHoverProvider(diagnosticCollection)
  supportedLanguages.forEach((language) => {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(language, hoverProvider),
    )
  })

  // Register CodeLens provider
  const codeLensProvider = new PickierCodeLensProvider(diagnosticCollection)
  supportedLanguages.forEach((language) => {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(language, codeLensProvider),
    )
  })

  // Watch config file for changes
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (workspaceFolders && workspaceFolders.length > 0) {
    const watcher = watchConfigFile(workspaceFolders[0].uri.fsPath, async () => {
      outputChannel.appendLine('Config file changed, reloading...')
      clearConfigCache()

      // Re-lint all open documents
      for (const editor of vscode.window.visibleTextEditors) {
        if (supportedLanguages.includes(editor.document.languageId)) {
          const token = resetLintToken(editor.document)
          await diagnosticProvider.provideDiagnostics(editor.document, token)
        }
      }
    })
    context.subscriptions.push(watcher)
  }

  // Register commands
  const { applyFix, fixAllInDocument } = await import('./code-actions')
  context.subscriptions.push(
    vscode.commands.registerCommand('pickier.format', () => formatDocument()),
    vscode.commands.registerCommand('pickier.formatSelection', () => formatSelection()),
    vscode.commands.registerCommand('pickier.lint', () => lintDocument()),
    vscode.commands.registerCommand('pickier.lintWorkspace', () => lintWorkspace()),
    vscode.commands.registerCommand('pickier.organizeImports', () => organizeImports()),
    vscode.commands.registerCommand('pickier.fixAll', async (document?: vscode.TextDocument) => {
      const doc = document || vscode.window.activeTextEditor?.document
      if (doc) {
        await fixAllInDocument(doc)
      }
    }),
    vscode.commands.registerCommand('pickier.applyFix', async (document: vscode.TextDocument, diagnostic: vscode.Diagnostic) => {
      await applyFix(document, diagnostic)
    }),
    vscode.commands.registerCommand('pickier.showRuleDocumentation', (ruleId: string) => showRuleDocumentation(ruleId)),
    vscode.commands.registerCommand('pickier.disableRule', (ruleId: string) => disableRule(ruleId)),
    vscode.commands.registerCommand('pickier.showOutputChannel', () => showOutputChannel(outputChannel)),
    vscode.commands.registerCommand('pickier.restartExtension', () => restartExtension()),
    diagnosticCollection,
    statusBarItem,
    outputChannel,
  )

  // Register event listeners
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const config = vscode.workspace.getConfiguration('pickier')

      if (!supportedLanguages.includes(document.languageId)) {
        return
      }

      statusBarItem.showWorking()

      try {
        if (config.get('lintOnSave', true)) {
          const token = resetLintToken(document)
          await diagnosticProvider.provideDiagnostics(document, token)
        }
      }
      finally {
        statusBarItem.hideWorking()
        statusBarItem.update(document, diagnosticCollection)
      }
    }),

    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const doc = event.document
      if (doc.languageId && supportedLanguages.includes(doc.languageId)) {
        const key = doc.uri.toString()
        const existing = changeDebounceTimers.get(key)
        if (existing)
          clearTimeout(existing)

        const timer = setTimeout(async () => {
          changeDebounceTimers.delete(key)
          const config = vscode.workspace.getConfiguration('pickier')
          if (config.get('lintOnChange', true)) {
            statusBarItem.showWorking()
            try {
              const token = resetLintToken(doc)
              await diagnosticProvider.provideDiagnostics(doc, token)
            }
            finally {
              statusBarItem.hideWorking()
              statusBarItem.update(doc, diagnosticCollection)
            }
          }
        }, 500)

        changeDebounceTimers.set(key, timer)
      }
    }),

    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (supportedLanguages.includes(document.languageId)) {
        statusBarItem.showWorking()
        try {
          const token = resetLintToken(document)
          await diagnosticProvider.provideDiagnostics(document, token)
        }
        finally {
          statusBarItem.hideWorking()
          statusBarItem.update(document, diagnosticCollection)
        }
      }
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && supportedLanguages.includes(editor.document.languageId)) {
        statusBarItem.update(editor.document, diagnosticCollection)
      }
    }),

    // Format on paste support
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const config = vscode.workspace.getConfiguration('pickier')

      if (!config.get('formatOnPaste', false)) {
        return
      }

      if (!config.get('enable', true)) {
        return
      }

      const document = event.document
      if (!supportedLanguages.includes(document.languageId)) {
        return
      }

      // Check if this is a paste operation (contentChanges with large text additions)
      for (const change of event.contentChanges) {
        // Heuristic: paste operations typically insert more than one line
        if (change.text.length > 50 && change.text.includes('\n')) {
          try {
            const cfg = await getPickierConfig()
            const { formatCode } = await import('pickier')

            const formatted = formatCode(change.text, cfg, document.fileName)

            if (formatted !== change.text) {
              const editor = vscode.window.activeTextEditor
              if (editor && editor.document === document) {
                await editor.edit((editBuilder) => {
                  editBuilder.replace(change.range, formatted)
                })
              }
            }
          }
          catch (error) {
            console.error('Error formatting pasted text:', error)
          }
          break // Only process the first large paste
        }
      }
    }),
  )

  // Auto-configure format-on-save when pickier.formatOnSave is enabled
  const pickierConfig = vscode.workspace.getConfiguration('pickier')
  if (pickierConfig.get('formatOnSave', true)) {
    const editorConfig = vscode.workspace.getConfiguration('editor')
    const currentFormatter = editorConfig.get<string>('defaultFormatter')

    // Only auto-configure if no default formatter is set or it's already pickier
    if (!currentFormatter || currentFormatter === 'pickier.pickier-vscode') {
      // Enable format on save at workspace level if not explicitly set
      const formatOnSaveInspect = editorConfig.inspect<boolean>('formatOnSave')
      if (formatOnSaveInspect?.workspaceValue === undefined && formatOnSaveInspect?.workspaceFolderValue === undefined) {
        outputChannel.appendLine('Auto-enabling editor.formatOnSave for Pickier')
      }
    }
  }

  // Initialize for currently open documents
  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document
    if (supportedLanguages.includes(document.languageId)) {
      statusBarItem.update(document, diagnosticCollection)
      const token = resetLintToken(document)
      await diagnosticProvider.provideDiagnostics(document, token)
    }
  }
}

export function deactivate(): void {
  if (diagnosticCollection) {
    diagnosticCollection.dispose()
  }
  if (statusBarItem) {
    statusBarItem.dispose()
  }
  if (outputChannel) {
    outputChannel.dispose()
  }
  // Cancel and dispose all outstanding lint tokens
  for (const [, cts] of lintTokenSources) {
    cts.cancel()
    cts.dispose()
  }
  lintTokenSources.clear()

  // Dispose config watcher
  disposeConfigWatcher()

  // Clear config cache
  clearConfigCache()
}

async function formatDocument() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('No active editor found')
    return
  }

  await formatDocumentInternal(editor.document)
}

async function formatSelection() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('No active editor found')
    return
  }

  const selection = editor.selection
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('No text selected')
    return
  }

  const document = editor.document
  const selectedText = document.getText(selection)

  statusBarItem.showWorking()

  try {
    const config = await getPickierConfig()
    const { formatCode } = await import('pickier')
    const formatted = formatCode(selectedText, config, document.fileName)

    if (formatted !== selectedText) {
      await editor.edit((editBuilder) => {
        editBuilder.replace(selection, formatted)
      })
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    vscode.window.showErrorMessage(`Failed to format selection: ${errorMessage}`)
    outputChannel.appendLine(`Format error: ${errorMessage}`)
  }
  finally {
    statusBarItem.hideWorking()
    statusBarItem.update(document, diagnosticCollection)
  }
}

async function formatDocumentInternal(document: vscode.TextDocument) {
  const editor = vscode.window.visibleTextEditors.find(e => e.document === document)
  if (!editor)
    return

  try {
    const config = await getPickierConfig()
    const { formatCode } = await import('pickier')
    const text = document.getText()
    const formatted = formatCode(text, config, document.fileName)

    if (formatted !== text) {
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length),
      )

      await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, formatted)
      })
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    vscode.window.showErrorMessage(`Failed to format document: ${errorMessage}`)
    outputChannel.appendLine(`Format error: ${errorMessage}`)
  }
}

async function lintDocument() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('No active editor found')
    return
  }

  statusBarItem.showWorking()

  try {
    const diagnosticProvider = new PickierDiagnosticProvider(diagnosticCollection, outputChannel)
    const token = resetLintToken(editor.document)
    await diagnosticProvider.provideDiagnostics(editor.document, token)
  }
  finally {
    statusBarItem.hideWorking()
    statusBarItem.update(editor.document, diagnosticCollection)
  }
}

async function lintWorkspace() {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders) {
    vscode.window.showWarningMessage('No workspace folder found')
    return
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath

  try {
    // Lint the whole workspace and populate Problems across files
    const diagnosticsMap = await lintPathsToDiagnostics([workspaceRoot], outputChannel)
    for (const [filePath, diags] of Object.entries(diagnosticsMap)) {
      const uri = vscode.Uri.file(filePath)
      diagnosticCollection.set(uri, diags)
    }

    const totalIssues = Object.values(diagnosticsMap).reduce((n, arr) => n + arr.length, 0)
    const msg = totalIssues === 0
      ? 'Workspace linting completed with no issues'
      : `Workspace linting found ${totalIssues} issue(s)`
    vscode.window.showInformationMessage(msg)

    const config = vscode.workspace.getConfiguration('pickier')
    if (config.get('showOutputChannel', false))
      outputChannel.show()
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    vscode.window.showErrorMessage(`Failed to lint workspace: ${errorMessage}`)
    outputChannel.appendLine(`Workspace lint error: ${errorMessage}`)
  }
}

function showRuleDocumentation(ruleId: string) {
  const config = vscode.workspace.getConfiguration('pickier')
  const baseUrl = config.get<string>('documentation.baseUrl', 'https://pickier.netlify.app')

  // Strip plugin prefix to get bare rule name
  const ruleName = ruleId.includes('/') ? ruleId.split('/')[1] : ruleId

  // Build documentation URL
  let url: string

  // Map built-in rules
  const builtInRules = ['quotes', 'indent', 'no-debugger', 'no-console', 'no-template-curly-in-string', 'no-cond-assign']
  if (builtInRules.includes(ruleName)) {
    url = `${baseUrl}/rules/${ruleName}`
  }
  // Map pickier plugin rules
  else if (ruleId.startsWith('pickier/')) {
    if (ruleName.startsWith('sort-')) {
      url = `${baseUrl}/rules/pickier-${ruleName}`
    }
    else {
      url = `${baseUrl}/rules/${ruleName}`
    }
  }
  // Map regexp rules
  else if (ruleId.startsWith('regexp/')) {
    url = `${baseUrl}/rules/regexp-${ruleName}`
  }
  // Map markdown rules
  else if (ruleId.startsWith('markdown/')) {
    url = `${baseUrl}/rules/markdown-${ruleName}`
  }
  // Map style rules
  else if (ruleId.startsWith('style/')) {
    url = `${baseUrl}/rules/style-${ruleName}`
  }
  // Map TypeScript rules
  else if (ruleId.startsWith('ts/')) {
    url = `${baseUrl}/rules/ts-${ruleName}`
  }
  // Fallback to rules index
  else {
    url = `${baseUrl}/rules`
  }

  vscode.env.openExternal(vscode.Uri.parse(url))
}

function disableRule(ruleId: string) {
  const message = `To disable ${ruleId}, add this to your pickier.config.ts:\n\npluginRules: {\n  '${ruleId}': 'off'\n}`
  vscode.window.showInformationMessage(message, 'Copy Config')
    .then((selection) => {
      if (selection === 'Copy Config') {
        vscode.env.clipboard.writeText(`'${ruleId}': 'off'`)
        vscode.window.showInformationMessage('Config copied to clipboard')
      }
    })
}
