# JSON & Config Sorting

Pickier sorts keys in known JSON files for smaller diffs and consistent structure over time. Two families are recognized:

- `package.json`
- `tsconfig*.json`

Other JSON files are left as-is except for whitespace and final newline policy.

## package.json ordering

Top-level keys follow a curated order that prioritizes identity, distribution, and tooling fields. Dependencies blocks and common nested objects are sorted alphabetically for predictability.

Highlights of the order:

1. `publisher`, `name`, `displayName`, `type`, `version`, `private`, `packageManager`
2. `description`, `author`, `contributors`, `license`, `funding`, `homepage`
3. `repository`, `bugs`, `keywords`, `categories`, `sideEffects`
4. `imports`, `exports`, `main`, `module`, `unpkg`, `jsdelivr`, `types`, `typesVersions`, `bin`, `icon`, `files`
5. `engines`, `activationEvents`, `contributes`, `scripts`
6. dependency blocks (all A–Z): `peerDependencies`, `peerDependenciesMeta`, `dependencies`, `optionalDependencies`, `devDependencies`
7. `pnpm`, `overrides`, `resolutions`, `husky`, `simple-git-hooks`, `lint-staged`, `eslintConfig`

Additionally:

- `files` array is sorted A–Z (if strings)
- all dependency blocks (`dependencies`, `devDependencies`, etc.) are sorted A–Z by package name
- `pnpm.overrides` (and nested forms) are sorted A–Z
- `exports` object sub-keys are ordered: `types`, `import`, `require`, `default`
- common git hook maps (`gitHooks`, `husky`, `simple-git-hooks`) use a stable hook order (`pre-commit`, `commit-msg`, ...)

Before:

```json
{
  "version": "1.0.0",
  "name": "demo",
  "dependencies": { "z": "1", "a": "1" },
  "files": ["dist/index.js", "README.md"],
  "exports": { "default": "./dist/index.js", "types": "./dist/index.d.ts" }
}
```

After (excerpt):

```json
{
  "name": "demo",
  "version": "1.0.0",
  "exports": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "files": ["README.md", "dist/index.js"],
  "dependencies": { "a": "1", "z": "1" }
}
```

## tsconfig ordering

Top-level keys:

1. `extends`
2. `compilerOptions`
3. `references`
4. `files`
5. `include`
6. `exclude`

Within `compilerOptions`, keys follow a stable, semantically-grouped order (incremental/build flags first, then module/JSX/resolution, then strictness and emit). Examples:

- build: `incremental`, `composite`, `tsBuildInfoFile`, ...
- module/JS/paths: `target`, `jsx`, `lib`, `module`, `moduleResolution`, `paths`, `types`, ...
- strictness: `strict`, `noImplicitAny`, `noUnusedLocals`, `exactOptionalPropertyTypes`, ...
- emit/source maps: `declaration`, `emitDeclarationOnly`, `sourceMap`, `outDir`, `verbatimModuleSyntax`, ...

Before:

```json
{
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "target": "ES2022",
    "strict": true
  },
  "extends": "@tsconfig/node18/tsconfig.json"
}
```

After:

```json
{
  "extends": "@tsconfig/node18/tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "target": "ES2022",
    "strict": true,
    "outDir": "dist"
  }
}
```

## Best practices

- Keep `package.json` script names simple and sorted implicitly by this rule; avoid relying on order for behavior
- Avoid placing generated fields in the top of `package.json`; the sorter will move them later
- Keep `compilerOptions` minimal and explicit; the sorter will keep a stable shape across machines

## Troubleshooting

- “My custom JSON was reordered” — only `package.json` and `tsconfig*.json` are reordered; other JSON is unchanged except whitespace and EOF policy
- “Why did `exports` change?” — sub-keys are ordered (`types`, `import`, `require`, `default`) to reduce diff noise
