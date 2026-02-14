import type { PickierPlugin } from '../types'
// Import rules
import { noUnusedVarsRule } from '../rules/general/no-unused-vars'
import { preferConstRule } from '../rules/general/prefer-const'
import { preferTemplate } from '../rules/general/prefer-template'
import { firstRule } from '../rules/imports/first'
import { importDedupeRule } from '../rules/imports/import-dedupe'
import { namedRule } from '../rules/imports/named'
import { noCycleRule } from '../rules/imports/no-cycle'
import { noDuplicateImportsRule } from '../rules/imports/no-duplicate-imports'
import { noImportDistRule } from '../rules/imports/no-import-dist'
import { noImportNodeModulesByPathRule } from '../rules/imports/no-import-node-modules-by-path'
import { noUnresolvedRule } from '../rules/imports/no-unresolved'
import { sortExportsRule } from '../rules/sort/exports'
import { sortHeritageClausesRule } from '../rules/sort/heritage-clauses'
import { sortImportsRule } from '../rules/sort/imports'
import { sortKeysRule } from '../rules/sort/keys'
import { sortNamedImportsRule } from '../rules/sort/named-imports'
import { sortObjectsRule } from '../rules/sort/objects'
import { topLevelFunctionRule } from '../rules/style/top-level-function'
import { codeOnly } from './utils'

export const pickierPlugin: PickierPlugin = {
  name: 'pickier',
  rules: {
    // Sort rules
    'sort-exports': codeOnly(sortExportsRule),
    'sort-objects': codeOnly(sortObjectsRule),
    'sort-imports': codeOnly(sortImportsRule),
    'sort-named-imports': codeOnly(sortNamedImportsRule),
    'sort-heritage-clauses': codeOnly(sortHeritageClausesRule),
    'sort-keys': codeOnly(sortKeysRule),

    // Import rules
    'import-dedupe': codeOnly(importDedupeRule),
    'import-first': codeOnly(firstRule),
    'import-named': codeOnly(namedRule),
    'import-no-cycle': codeOnly(noCycleRule),
    'import-no-unresolved': codeOnly(noUnresolvedRule),
    'no-import-dist': codeOnly(noImportDistRule),
    'no-import-node-modules-by-path': codeOnly(noImportNodeModulesByPathRule),
    'no-duplicate-imports': codeOnly(noDuplicateImportsRule),

    // Style rules
    'top-level-function': codeOnly(topLevelFunctionRule),

    // General rules (also registered in general plugin for backward compat)
    'prefer-const': codeOnly(preferConstRule),
    'prefer-template': codeOnly(preferTemplate),
    'no-unused-vars': codeOnly(noUnusedVarsRule),
  },
}
