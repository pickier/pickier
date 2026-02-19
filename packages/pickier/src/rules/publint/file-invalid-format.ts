import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { crawlExportsOrImports, createIssue, formatPkgPath, getCodeFormat, getCodeFormatExtension, getFilePathFormat, getPkgDir, getPublishedField, isExplicitExtension, isLintableFilePath, parsePackageJson, resolvePkgPath } from './utils'

export const fileInvalidFormat: RuleModule = {
  meta: {
    docs: 'Ensure file code format matches its extension and package type',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []
    const pkgDir = getPkgDir(context.filePath)
    const pkgType = pkg.type

    // Check main field
    const [mainValue, mainPath] = getPublishedField(pkg, 'main')
    if (mainValue != null && typeof mainValue === 'string') {
      checkFileFormat(mainValue, mainPath, pkgDir, pkgType, issues, context.filePath, content)
    }

    // Check exports string values
    const [exportsValue, exportsPath] = getPublishedField(pkg, 'exports')
    if (exportsValue != null) {
      crawlExportsOrImports(exportsValue, exportsPath, false, (value, ctx) => {
        if (typeof value !== 'string') return
        if (!value.startsWith('./') && !value.startsWith('../')) return
        if (value.includes('*')) return // Skip glob patterns
        // Skip browser/bundler paths (they're fine with ESM regardless)
        if (ctx.path.includes('browser')) return

        checkFileFormat(value, ctx.path, pkgDir, pkgType, issues, context.filePath, content)
      })
    }

    return issues
  },
}

function checkFileFormat(
  filePath: string,
  pkgPath: string[],
  pkgDir: string,
  pkgType: string | undefined,
  issues: LintIssue[],
  contextFilePath: string,
  content: string,
): void {
  const resolved = resolvePkgPath(pkgDir, filePath)
  if (!existsSync(resolved)) return
  if (!isLintableFilePath(filePath)) return

  let fileContent: string
  try {
    fileContent = readFileSync(resolved, 'utf8')
  }
  catch {
    return
  }

  const actualFormat = getCodeFormat(fileContent)
  if (actualFormat === 'unknown' || actualFormat === 'mixed') return

  const expectFormat = getFilePathFormat(resolved, pkgType)
  if (actualFormat === expectFormat) return

  const actualExtension = extname(resolved)
  const expectExtension = getCodeFormatExtension(actualFormat)

  const code = isExplicitExtension(actualExtension)
    ? 'FILE_INVALID_EXPLICIT_FORMAT'
    : 'FILE_INVALID_FORMAT'

  const message = code === 'FILE_INVALID_EXPLICIT_FORMAT'
    ? `${formatPkgPath(pkgPath)} is "${filePath}" and ends with the ${actualExtension} extension, but the code is written in ${actualFormat}. Consider using the ${expectExtension} extension.`
    : `${formatPkgPath(pkgPath)} is "${filePath}" and is written in ${actualFormat}, but is interpreted as ${expectFormat}. Consider using the ${expectExtension} extension.`

  issues.push(createIssue(
    contextFilePath,
    content,
    pkgPath,
    'publint/file-invalid-format',
    message,
    'warning',
    `The file's code format (${actualFormat}) doesn't match the expected format (${expectFormat}) based on its extension and package type.`,
  ))
}
