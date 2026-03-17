import type { RuleModule } from '../../types'

const GLOBAL_OBJECTS = [
  'Array',
  'Boolean',
  'Date',
  'Error',
  'Function',
  'JSON',
  'Math',
  'Number',
  'Object',
  'RegExp',
  'String',
  'Symbol',
  'undefined',
  'NaN',
  'Infinity',
  'isNaN',
  'isFinite',
  'parseFloat',
  'parseInt',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'eval',
  'Promise',
  'Proxy',
  'Reflect',
  'Set',
  'Map',
  'WeakSet',
  'WeakMap',
  'ArrayBuffer',
  'DataView',
  'console',
  'window',
  'document',
  'globalThis',
  'global',
  'process',
]

export const noGlobalAssignRule: RuleModule = {
  meta: {
    docs: 'Disallow assignment to native objects or read-only global variables',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for assignments to global objects
      for (const global of GLOBAL_OBJECTS) {
        const assignPattern = new RegExp(`\\b${global}\\s*=\\s*[^=]`, 'g')

        let match
        for (match = assignPattern.exec(line); match !== null; match = assignPattern.exec(line)) {
          // Make sure it's not a comparison
          if (!line.slice(match.index).match(new RegExp(`^${global}\\s*===?`))) {
            issues.push({
              filePath: ctx.filePath,
              line: i + 1,
              column: match.index + 1,
              ruleId: 'eslint/no-global-assign',
              message: `Read-only global '${global}' should not be modified`,
              severity: 'error',
            })
          }
        }
      }
    }

    return issues
  },
}
