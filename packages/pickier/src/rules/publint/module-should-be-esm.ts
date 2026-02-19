import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { existsSync, readFileSync } from 'node:fs'
import { createIssue, formatPkgPath, getCodeFormat, getPkgDir, getPublishedField, isLintableFilePath, parsePackageJson, resolvePkgPath } from './utils'

export const moduleShouldBeEsm: RuleModule = {
  meta: {
    docs: 'Ensure the "module" field points to an ESM file',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []

    const [moduleValue, modulePath] = getPublishedField(pkg, 'module')
    if (moduleValue == null || typeof moduleValue !== 'string') return []

    const pkgDir = getPkgDir(context.filePath)
    const resolved = resolvePkgPath(pkgDir, moduleValue)

    if (!existsSync(resolved)) return [] // file-does-not-exist handles this
    if (!isLintableFilePath(moduleValue)) return []

    let fileContent: string
    try {
      fileContent = readFileSync(resolved, 'utf8')
    }
    catch {
      return []
    }

    const actualFormat = getCodeFormat(fileContent)
    if (actualFormat === 'CJS') {
      return [createIssue(
        context.filePath,
        content,
        modulePath,
        'publint/module-should-be-esm',
        `${formatPkgPath(modulePath)} should be ESM, but the code is written in CJS.`,
        'error',
        'The "module" field is intended for ESM output used by bundlers. It should point to an ESM file.',
      )]
    }

    return []
  },
}
