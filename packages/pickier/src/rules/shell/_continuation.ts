import { maskShellStrings } from './_shared'

/** Continuation indentation is temporary; only a completed header opens a block. */
export class ShellContinuation {
  private continued = false
  private header: 'then' | 'do' | undefined

  read(line: string): { continuation: boolean, closesHeader: boolean } {
    return this.readMasked(maskShellStrings(line))
  }

  readMasked(line: string, continues = false): { continuation: boolean, closesHeader: boolean } {
    const code = line.trim()
    const continuation = this.continued
    if (!continuation) {
      this.header = /^(?:if|elif)\b/.test(code) ? 'then' : /^(?:while|for|until)\b/.test(code) ? 'do' : undefined
    }
    const closesHeader = continuation && this.header !== undefined && new RegExp(`\\b${this.header}\\s*$`).test(code)
    const slashes = code.match(/\\+$/)?.[0].length ?? 0
    this.continued = continues || slashes % 2 === 1
    if (!this.continued)
      this.header = undefined
    return { continuation, closesHeader }
  }
}
