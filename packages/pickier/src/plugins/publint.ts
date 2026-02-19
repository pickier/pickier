import type { PickierPlugin } from '../types'
import {
  binFileNotExecutable,
  deprecatedFieldJsnext,
  exportsDefaultShouldBeLast,
  exportsFallbackArrayUse,
  exportsMissingRootEntrypoint,
  exportsModuleShouldBeEsm,
  exportsModuleShouldPrecedeRequire,
  exportsTypesShouldBeFirst,
  exportsValueInvalid,
  fieldInvalidValueType,
  fileDoesNotExist,
  fileInvalidFormat,
  hasModuleButNoExports,
  importsDefaultShouldBeLast,
  importsKeyInvalid,
  importsModuleShouldPrecedeRequire,
  importsValueInvalid,
  localDependency,
  moduleShouldBeEsm,
  useType,
} from '../rules/publint'
import { packageJsonOnly } from './utils'

/**
 * publint plugin for pickier.
 *
 * Validates package.json files for correct npm publishing configuration.
 * Checks exports/imports ordering, field types, file format, module system, etc.
 *
 * Ported from publint (https://publint.dev).
 */
export const publintPlugin: PickierPlugin = {
  name: 'publint',
  rules: {
    // Tier 1 - Pure JSON analysis
    'use-type': packageJsonOnly(useType),
    'local-dependency': packageJsonOnly(localDependency),
    'deprecated-field-jsnext': packageJsonOnly(deprecatedFieldJsnext),
    'has-module-but-no-exports': packageJsonOnly(hasModuleButNoExports),
    'field-invalid-value-type': packageJsonOnly(fieldInvalidValueType),
    'exports-types-should-be-first': packageJsonOnly(exportsTypesShouldBeFirst),
    'exports-default-should-be-last': packageJsonOnly(exportsDefaultShouldBeLast),
    'exports-module-should-precede-require': packageJsonOnly(exportsModuleShouldPrecedeRequire),
    'exports-value-invalid': packageJsonOnly(exportsValueInvalid),
    'exports-missing-root-entrypoint': packageJsonOnly(exportsMissingRootEntrypoint),
    'exports-fallback-array-use': packageJsonOnly(exportsFallbackArrayUse),
    'imports-key-invalid': packageJsonOnly(importsKeyInvalid),
    'imports-value-invalid': packageJsonOnly(importsValueInvalid),
    'imports-default-should-be-last': packageJsonOnly(importsDefaultShouldBeLast),
    'imports-module-should-precede-require': packageJsonOnly(importsModuleShouldPrecedeRequire),
    // Tier 2 - Filesystem access
    'file-does-not-exist': packageJsonOnly(fileDoesNotExist),
    'file-invalid-format': packageJsonOnly(fileInvalidFormat),
    'module-should-be-esm': packageJsonOnly(moduleShouldBeEsm),
    'bin-file-not-executable': packageJsonOnly(binFileNotExecutable),
    'exports-module-should-be-esm': packageJsonOnly(exportsModuleShouldBeEsm),
  },
}
