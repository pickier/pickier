import type { RuleModule } from '../../types'

const nativeObjects = [
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Date',
  'RegExp',
  'Function',
  'Math',
  'JSON',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Symbol',
  'Proxy',
  'Reflect',
  'Error',
  'TypeError',
  'RangeError',
]

export const noExtendNativeRule: RuleModule = {
  meta: {
    docs: 'Disallow extending native types',
    recommended: true,
  },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for prototype modifications
      for (const nativeObj of nativeObjects) {
        const pattern = new RegExp(`\\b${nativeObj}\\.prototype\\.\\w+\\s*=`, 'g')
        let match

        for (match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
          // Skip if in comment
          if (line.substring(0, match.index).includes('//'))
            continue

          issues.push({
            filePath: ctx.filePath,
            line: i + 1,
            column: Math.max(1, match.index + 1),
            ruleId: 'eslint/no-extend-native',
            message: `${nativeObj} prototype is read only, properties should not be added`,
            severity: 'error',
          })
        }
      }
    }

    return issues
  },
}
