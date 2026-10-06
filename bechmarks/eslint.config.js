// ESLint's own recommended rules plus typescript-eslint's, without type
// information — the configuration a TypeScript project starts from. Used by
// the lint and combined benchmarks; without a config ESLint exits with an
// error before linting anything.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
