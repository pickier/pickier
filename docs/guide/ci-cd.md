# CI/CD Integration

This guide covers integrating Pickier into continuous integration and deployment pipelines.

## GitHub Actions

### Basic Lint Workflow

[pantry](https://github.com/pantry-pm/pantry) sets up the job in one step: it installs what `deps.yaml` lists and the `package.json` dependencies, and caches both between runs.

```yaml
# deps.yaml
dependencies:
  bun.sh: ^1.4.2
```

```yaml
# .github/workflows/lint.yml
name: Lint

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6

      - uses: pantry-pm/pantry/packages/action@v0.11.74

      - name: Lint
        run: bunx pickier lint .

      - name: Check formatting
        run: bunx pickier format . --check
```

### Strict Mode for CI

Configure Pickier for strict CI behavior:

```yaml
# .github/workflows/lint.yml
- name: Lint (strict)
  run: bunx pickier lint . --max-warnings 0 --reporter compact

- name: Check formatting (fail on diff)
  run: bunx pickier format . --check
```

### With Fix and Commit

Automatically fix and commit changes:

```yaml
# .github/workflows/auto-fix.yml
name: Auto-fix

on:
  pull_request:
    branches: [main]

jobs:
  fix:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.head_ref }}
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: pantry-pm/pantry/packages/action@v0.11.74

      - name: Fix lint issues
        run: bunx pickier lint . --fix

      - name: Format code
        run: bunx pickier format . --write

      - name: Commit changes
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore: auto-fix lint and format'
```

### Matrix Testing

Test across several Bun versions. Naming packages in `packages:` installs exactly those instead of what `deps.yaml` lists, and leaves the project's dependencies to you:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        bun-version: ['1.3', '1.4']

    steps:
      - uses: actions/checkout@v6

      - uses: pantry-pm/pantry/packages/action@v0.11.74
        with:
          packages: bun.sh@${{ matrix.bun-version }}

      - run: bun install
      - run: bunx pickier lint .
```

## GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - lint

lint:
  stage: lint
  image: oven/bun:latest
  script:
    - bun install
    - bunx pickier lint .
    - bunx pickier format . --check
  rules:
    - if: $CI_MERGE_REQUEST_ID
    - if: $CI_COMMIT_BRANCH == "main"
```

## CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  lint:
    docker:
      - image: oven/bun:latest
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: bun install
      - run:
          name: Lint
          command: bunx pickier lint . --max-warnings 0
      - run:
          name: Check formatting
          command: bunx pickier format . --check

workflows:
  main:
    jobs:
      - lint
```

## Pre-commit Hooks

### Using husky and lint-staged

```bash
# Install
bun add -D husky lint-staged

# Initialize husky
bunx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "pickier lint --fix",
      "pickier format --write"
    ],
    "*.{json,md,yaml,yml}": [
      "pickier format --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
bunx lint-staged
```

### Using lefthook

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{ts,tsx,js,jsx}"
      run: bunx pickier lint {staged_files} --fix
    format:
      glob: "*.{ts,tsx,js,jsx,json,md}"
      run: bunx pickier format {staged_files} --write
```

## VS Code Integration

### Tasks

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Lint",
      "type": "shell",
      "command": "bunx pickier lint .",
      "group": "test",
      "problemMatcher": "$eslint-stylish"
    },
    {
      "label": "Lint Fix",
      "type": "shell",
      "command": "bunx pickier lint . --fix",
      "group": "test"
    },
    {
      "label": "Format",
      "type": "shell",
      "command": "bunx pickier format . --write",
      "group": "build"
    }
  ]
}
```

### Settings

```json
// .vscode/settings.json
{
  "editor.codeActionsOnSave": {
    "source.fixAll": true
  },
  "editor.formatOnSave": true
}
```

## Docker

### Dockerfile

```dockerfile
FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Run lint during build
RUN bunx pickier lint . --max-warnings 0
RUN bunx pickier format . --check
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  lint:
    build: .
    command: bunx pickier lint . --reporter json
    volumes:
      - .:/app
      - /app/node_modules
```

## Makefile

```makefile
# Makefile
.PHONY: lint format check fix

lint:
	bunx pickier lint .

format:
	bunx pickier format . --check

check: lint format

fix:
	bunx pickier lint . --fix
	bunx pickier format . --write
```

## npm Scripts

```json
{
  "scripts": {
    "lint": "pickier lint .",
    "lint:fix": "pickier lint . --fix",
    "lint:strict": "pickier lint . --max-warnings 0",
    "format": "pickier format . --write",
    "format:check": "pickier format . --check",
    "check": "pickier lint . && pickier format . --check",
    "fix": "pickier lint . --fix && pickier format . --write"
  }
}
```

## CI Configuration Tips

### 1. Use JSON Reporter for Parsing

```yaml
- name: Lint with JSON output
  run: |
    bunx pickier lint . --reporter json > lint-results.json
    jq '.issues | length' lint-results.json
```

The report is `{ "errors": number, "warnings": number, "issues": [...] }`.

### 2. Cache Lint Results

The pantry action already caches the toolchain and dependencies. For very large repositories, `--cache` also keeps each file's lint results, so a run only lints the files whose content changed:

```yaml
- uses: actions/cache@v5
  with:
    path: .pickiercache
    key: pickier-${{ github.sha }}
    restore-keys: pickier-

- name: Lint
  run: bunx pickier lint . --cache
```

### 3. Fail Fast

```yaml
- name: Lint
  run: bunx pickier lint . --max-warnings 0
  continue-on-error: false
```

### 4. Annotations

```yaml
- name: Lint with annotations
  run: bunx pickier lint . --reporter compact 2>&1 | tee lint-output.txt

- name: Annotate
  if: failure()
  run: |
    # Parse and create annotations
    cat lint-output.txt
```

### 5. Status Checks

Configure as required status check in GitHub:

1. Go to Settings > Branches > Branch protection rules
2. Check "Require status checks to pass before merging"
3. Select "lint" workflow

## Environment-specific Config

```typescript
// pickier.config.ts
const isCI = process.env.CI === 'true'

export default {
  lint: {
    // Stricter in CI
    maxWarnings: isCI ? 0 : -1,
    reporter: isCI ? 'compact' : 'stylish',
  },

  verbose: isCI,
}
```

## Related

- [Configuration](/guide/configuration)
- [CLI Commands](/guide/cli)
- [Programmatic API](/guide/programmatic)
