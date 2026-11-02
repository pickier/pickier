import { mock } from 'bun:test'
import { EventEmitter } from 'node:events'

/**
 * A stand-in for `vscode.TextDocument`, backed by a string.
 *
 * The tests used to write one of these inline wherever they needed a
 * document, with whichever members the code under test happened to reach at
 * the time. Then `code-actions.ts` started reading `document.lineAt(...)` to
 * build its "disable this rule for this line" action, and every one of those
 * literals was missing it. Deriving the whole surface from the text keeps the
 * next member the extension reaches for from being the next failure.
 */
export function createTextDocument(text: string, fileName = '/test.ts', languageId = 'typescript'): any {
  const lines = text.split(/\r?\n/)
  return {
    fileName,
    languageId,
    uri: { toString: () => `file://${fileName}`, fsPath: fileName, path: fileName, scheme: 'file' },
    version: 1,
    lineCount: lines.length,
    getText: (range?: any) => {
      if (!range)
        return text
      const from = range.start, to = range.end
      if (from.line === to.line)
        return (lines[from.line] ?? '').slice(from.character, to.character)
      const out = [(lines[from.line] ?? '').slice(from.character)]
      for (let i = from.line + 1; i < to.line; i++) out.push(lines[i] ?? '')
      out.push((lines[to.line] ?? '').slice(0, to.character))
      return out.join('\n')
    },
    // VS Code takes either a line number or a Position here.
    lineAt: (lineOrPosition: number | { line: number }) => {
      const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line
      const lineText = lines[line] ?? ''
      return {
        lineNumber: line,
        text: lineText,
        range: { start: { line, character: 0 }, end: { line, character: lineText.length } },
        firstNonWhitespaceCharacterIndex: lineText.length - lineText.trimStart().length,
        isEmptyOrWhitespace: lineText.trim().length === 0,
      }
    },
    positionAt: (offset: number) => {
      let remaining = Math.max(0, Math.min(offset, text.length))
      for (let line = 0; line < lines.length; line++) {
        const width = lines[line].length
        if (remaining <= width)
          return { line, character: remaining }
        remaining -= width + 1
      }
      const last = lines.length - 1
      return { line: last, character: lines[last].length }
    },
    offsetAt: (position: { line: number, character: number }) => {
      let offset = 0
      for (let line = 0; line < position.line && line < lines.length; line++) offset += lines[line].length + 1
      return offset + position.character
    },
  }
}

export function createVscodeMock(overrides: Partial<any> = {}): any {
  // Simple event emitter helpers to simulate VS Code event API
  const makeEvent = <T = any>() => {
    const emitter = new EventEmitter()
    const event = (listener: (e: T) => any) => {
      emitter.on('event', listener)
      return {
        dispose() {
          emitter.removeListener('event', listener)
        },
      }
    }
    return { emitter, event }
  }

  // CancellationToken and source
  class CancellationTokenImpl {
    isCancellationRequested = false
    // make public to avoid TS isolatedDeclarations complaint on private fields of exported types
    _emitter = new EventEmitter()
    onCancellationRequested(listener: () => void) {
      this._emitter.on('cancel', listener)
      return { dispose: () => this._emitter.removeListener('cancel', listener) }
    }

    _cancel() {
      this.isCancellationRequested = true
      this._emitter.emit('cancel')
    }
  }
  class CancellationTokenSourceImpl {
    token = new CancellationTokenImpl()
    cancel() { this.token._cancel() }
    dispose() {}
  }

  class PositionImpl { constructor(public line: number, public character: number) {} }
  class RangeImpl {
    constructor(public start: any, public end: any) {}
  }

  // Minimal TextEdit
  class TextEditImpl {
    static replace(range: any, newText: string) {
      return { range, newText }
    }
  }

  class DiagnosticImpl {
    source?: string
    code?: any
    constructor(public range: any, public message: string, public severity: number) {}
  }

  const DiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  } as const

  const StatusBarAlignment = {
    Left: 1,
    Right: 2,
  } as const

  const CodeActionKind = {
    Empty: '',
    QuickFix: 'quickfix',
    Refactor: 'refactor',
    RefactorExtract: 'refactor.extract',
    RefactorInline: 'refactor.inline',
    RefactorRewrite: 'refactor.rewrite',
    Source: 'source',
    SourceOrganizeImports: 'source.organizeImports',
    SourceFixAll: 'source.fixAll',
  } as const

  class CodeActionImpl {
    title: string
    kind?: any
    diagnostics?: any[]
    isPreferred?: boolean
    command?: any
    edit?: any

    constructor(title: string, kind?: any) {
      this.title = title
      this.kind = kind
    }
  }

  // CodeActionProvider interface (for TypeScript implements checking)
  interface _CodeActionProvider {
    provideCodeActions: (
      document: any,
      range: any,
      context: any,
      token: any,
    ) => Promise<any[] | undefined>
  }

  class WorkspaceEditImpl {
    private changes = new Map<string, any[]>()

    replace(uri: any, range: any, newText: string) {
      this.record(uri, { range, newText })
    }

    // `code-actions.ts` inserts a disable comment above a line with this.
    insert(uri: any, position: any, newText: string) {
      this.record(uri, { range: { start: position, end: position }, newText })
    }

    delete(uri: any, range: any) {
      this.record(uri, { range, newText: '' })
    }

    get(uri: any) {
      return this.changes.get(typeof uri === 'string' ? uri : uri.toString()) ?? []
    }

    private record(uri: any, edit: any) {
      const key = typeof uri === 'string' ? uri : uri.toString()
      const edits = this.changes.get(key) || []
      edits.push(edit)
      this.changes.set(key, edits)
    }
  }

  class RelativePatternImpl {
    constructor(public base: string, public pattern: string) {}
  }

  class FileSystemWatcherImpl {
    onDidCreate = makeEvent<any>().event
    onDidChange = makeEvent<any>().event
    onDidDelete = makeEvent<any>().event
    dispose = mock(() => {})
  }

  // Minimal TextDocument
  class _TextDocumentImpl {
    uri: any
    constructor(public fileName: string, private text: string, public languageId: string = 'typescript') {
      this.uri = { fsPath: this.fileName, toString: () => `file://${this.fileName}` }
    }

    getText(range?: any) {
      if (!range)
        return this.text
      // naive: assume full provided text for tests
      return this.text.substring(0)
    }

    positionAt(offset: number) {
      return new PositionImpl(0, offset)
    }
  }

  // Editors
  let activeTextEditor: any = null
  let visibleTextEditors: any[] = []

  // Status bar item mock
  const statusBarItem = {
    text: '',
    tooltip: '',
    command: undefined as any,
    show: mock(() => {}),
    hide: mock(() => {}),
    dispose: mock(() => {}),
  }

  // Output channel mock
  const outputChannel = {
    appendLine: mock(() => {}),
    show: mock(() => {}),
    dispose: mock(() => {}),
  }

  // Diagnostic collection
  const diagnosticStore = new Map<string, any[]>()
  const diagnosticCollection = {
    set: mock((uri: any, diagnostics: any[]) => {
      const key = typeof uri === 'string' ? uri : uri.toString()
      diagnosticStore.set(key, diagnostics)
    }),
    get: mock((uri: any) => {
      const key = typeof uri === 'string' ? uri : uri.toString()
      return diagnosticStore.get(key) || []
    }),
    delete: mock((uri: any) => {
      const key = typeof uri === 'string' ? uri : uri.toString()
      diagnosticStore.delete(key)
    }),
    dispose: mock(() => {}),
  }

  // Commands registry
  const commandsMap = new Map<string, (...args: any[]) => any>()

  // Workspace events
  const onDidSaveTextDocument = makeEvent<any>()
  const onDidChangeTextDocument = makeEvent<any>()
  const onDidOpenTextDocument = makeEvent<any>()

  // Window events
  const onDidChangeActiveTextEditor = makeEvent<any>()

  const vscode = {
    // classes/types
    Range: RangeImpl,
    Position: PositionImpl,
    Diagnostic: DiagnosticImpl,
    DiagnosticSeverity,
    TextEdit: TextEditImpl,
    StatusBarAlignment,
    CancellationTokenSource: CancellationTokenSourceImpl,
    CodeAction: CodeActionImpl,
    CodeActionKind,
    WorkspaceEdit: WorkspaceEditImpl,
    RelativePattern: RelativePatternImpl,
    CodeActionProvider: null as any, // Interface for TypeScript checking

    // namespace APIs
    Uri: { file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }) },

    window: {
      createStatusBarItem: mock(() => statusBarItem),
      createOutputChannel: mock(() => outputChannel),
      showWarningMessage: mock(() => {}),
      showErrorMessage: mock(() => {}),
      showInformationMessage: mock(() => {}),
      get activeTextEditor() { return activeTextEditor },
      set activeTextEditor(v: any) { activeTextEditor = v },
      get visibleTextEditors() { return visibleTextEditors },
      set visibleTextEditors(v: any[]) { visibleTextEditors = v },
      onDidChangeActiveTextEditor: onDidChangeActiveTextEditor.event,
    },

    workspace: {
      getConfiguration: mock(() => ({
        get: (key: string, defaultValue: any = undefined) => {
          const map: Record<string, any> = {
            'enable': true,
            'lintOnSave': true,
            'lintOnChange': true,
            'formatOnSave': false,
            'formatOnPaste': false,
            'showOutputChannel': false,
            'configPath': '',
            'codeActions.enable': true,
            'statusBar.showIssueCount': true,
          }
          if (key in map)
            return map[key]
          // support "pickier.xxx" keys
          if (key.startsWith('pickier.'))
            return map[key.replace('pickier.', '')]
          return defaultValue !== undefined ? defaultValue : false
        },
      })),
      applyEdit: mock(async () => true),
      createFileSystemWatcher: mock(() => new FileSystemWatcherImpl()),
      onDidSaveTextDocument: onDidSaveTextDocument.event,
      onDidChangeTextDocument: onDidChangeTextDocument.event,
      onDidOpenTextDocument: onDidOpenTextDocument.event,
      get workspaceFolders() { return [{ uri: { fsPath: '/workspace' } }] },
    },

    languages: {
      createDiagnosticCollection: mock(() => diagnosticCollection),
      registerDocumentFormattingEditProvider: mock(() => ({ dispose() {} })),
      registerDocumentRangeFormattingEditProvider: mock(() => ({ dispose() {} })),
      registerCodeActionsProvider: mock(() => ({ dispose() {} })),
      registerHoverProvider: mock(() => ({ dispose() {} })),
      registerCodeLensProvider: mock(() => ({ dispose() {} })),
    },

    commands: {
      registerCommand: mock((cmd: string, cb: (...args: any[]) => any) => {
        commandsMap.set(cmd, cb)
        return {
          dispose() {
            commandsMap.delete(cmd)
          },
        }
      }),
      executeCommand: mock(async () => undefined),
      _invoke: (cmd: string, ...args: any[]) => commandsMap.get(cmd)?.(...args),
    },
  }

  return Object.assign(vscode, overrides)
}
