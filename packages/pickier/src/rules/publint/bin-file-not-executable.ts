import type { LintIssue, RuleContext, RuleModule } from '../../types'
import { existsSync, readFileSync } from 'node:fs'
import { createIssue, formatPkgPath, getPkgDir, getPublishedField, isLintableFilePath, parsePackageJson, resolvePkgPath, startsWithShebang } from './utils'

export const binFileNotExecutable: RuleModule = {
  meta: {
    docs: 'Ensure bin files have a shebang for executability',
    recommended: true,
  },

  check(content: string, context: RuleContext): LintIssue[] {
    const pkg = parsePackageJson(content)
    if (!pkg) return []
    const issues: LintIssue[] = []
    const pkgDir = getPkgDir(context.filePath)

    const [binValue, binPath] = getPublishedField(pkg, 'bin')
    if (binValue == null) return []

    if (typeof binValue === 'string') {
      checkBin(binValue, binPath, pkgDir, issues, context.filePath, content)
    }
    else if (typeof binValue === 'object') {
      for (const key of Object.keys(binValue)) {
        if (typeof binValue[key] === 'string') {
          checkBin(binValue[key], binPath.concat(key), pkgDir, issues, context.filePath, content)
        }
      }
    }

    return issues
  },
}

function checkBin(
  filePath: string,
  pkgPath: string[],
  pkgDir: string,
  issues: LintIssue[],
  contextFilePath: string,
  content: string,
): void {
  const resolved = resolvePkgPath(pkgDir, filePath)
  if (!existsSync(resolved)) return // file-does-not-exist handles this
  if (!isLintableFilePath(filePath)) return

  let fileContent: string
  try {
    fileContent = readFileSync(resolved, 'utf8')
  }
  catch {
    return
  }

  if (!startsWithShebang(fileContent)) {
    issues.push(createIssue(
      contextFilePath,
      content,
      pkgPath,
      'publint/bin-file-not-executable',
      `${formatPkgPath(pkgPath)} is "${filePath}" but the file is not executable. It should start with a shebang, e.g. #!/usr/bin/env node.`,
      'error',
      'Bin files must start with a shebang (e.g. #!/usr/bin/env node) to be executable.',
    ))
  }
}
