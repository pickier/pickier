import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../../src/linter'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-unused-vars-tpl-'))
}

function makeConfig(dir: string): string {
  const cfgPath = join(dir, 'pickier.config.json')
  writeFileSync(cfgPath, JSON.stringify({
    verbose: false,
    ignores: [],
    lint: { extensions: ['ts'], reporter: 'json', cache: false, maxWarnings: -1 },
    format: { extensions: ['ts'], trimTrailingWhitespace: true, maxConsecutiveBlankLines: 1, finalNewline: 'one', indent: 2, quotes: 'single', semi: false },
    rules: { noDebugger: 'off', noConsole: 'off' },
    plugins: [{ name: 'pickier', rules: {} }],
    pluginRules: { 'general/no-unused-vars': 'error', 'style/max-statements-per-line': 'off', 'pickier/prefer-const': 'off' },
  }, null, 2), 'utf8')
  return cfgPath
}

describe('no-unused-vars: template literal scenarios', () => {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Parameters destructured from options, used in multi-line template literal
  // ────────────────────────────────────────────────────────────────────────
  describe('destructured params used in template literals', () => {
    it('recognizes destructured options used in multi-line template literal', async () => {
      const dir = tmp()
      const src = [
        'export interface Options {',
        '  region?: string',
        '  image?: string',
        '}',
        '',
        'export function generateConfig(options: Options = {}): string {',
        '  const {',
        '    region = "us-east-1",',
        '    image = "node:latest",',
        '  } = options',
        '',
        '  return `version: 2.1',
        'executors:',
        '  default:',
        '    docker:',
        '      - image: ${image}',
        '    environment:',
        '      REGION: ${region}',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('recognizes destructured options with many fields used in template', async () => {
      const dir = tmp()
      const src = [
        'export function generateDeploymentConfig(options: any = {}): string {',
        '  const {',
        '    awsRegion = "us-east-1",',
        '    dockerImage = "oven/bun:latest",',
        '    deployCommand = "bun run cloud deploy",',
        '    testCommand = "bun test",',
        '    buildCommand = "bun run build",',
        '    workflows = true,',
        '  } = options',
        '',
        '  return `version: 2.1',
        'executors:',
        '  bun-executor:',
        '    docker:',
        '      - image: ${dockerImage}',
        '    environment:',
        '      AWS_DEFAULT_REGION: ${awsRegion}',
        '      AWS_REGION: ${awsRegion}',
        'jobs:',
        '  test:',
        '    executor: bun-executor',
        '    steps:',
        '      - checkout',
        '      - run:',
        '          name: Run tests',
        '          command: ${testCommand}',
        '  build:',
        '    executor: bun-executor',
        '    steps:',
        '      - checkout',
        '      - run:',
        '          name: Build',
        '          command: ${buildCommand}',
        '  deploy:',
        '    executor: bun-executor',
        '    steps:',
        '      - checkout',
        '      - run:',
        '          name: Deploy',
        '          command: ${deployCommand}',
        '${workflows ? `workflows:',
        '  version: 2',
        '  build-test-deploy:',
        '    jobs:',
        '      - test',
        '      - build:',
        '          requires:',
        '            - test',
        '      - deploy:',
        '          requires:',
        '            - build',
        '` : ""}',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 2. Nested template literals with ternary expressions
  // ────────────────────────────────────────────────────────────────────────
  describe('nested template literals with ternary', () => {
    it('handles ${cond ? `...` : ""} on a single line', async () => {
      const dir = tmp()
      const src = [
        'function render(showTitle: boolean): string {',
        '  return `<div>${showTitle ? `<h1>Title</h1>` : ""}</div>`',
        '}',
        'render(true)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles multi-line ${cond ? `...` : ""} spanning many lines', async () => {
      const dir = tmp()
      const src = [
        'function renderConfig(workflows: boolean): string {',
        '  return `base config',
        '${workflows ? `workflows:',
        '  version: 2',
        '  jobs:',
        '    - test',
        '    - build',
        '` : ""}',
        '`',
        '}',
        'renderConfig(true)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles deeply nested template literals', async () => {
      const dir = tmp()
      const src = [
        'function deepNested(a: boolean, b: boolean, c: string): string {',
        '  return `outer ${a ? `middle ${b ? `inner ${c}` : "no-c"}` : "no-a"}`',
        '}',
        'deepNested(true, true, "val")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 3. Arrow functions with template literal expression bodies (.map, .filter)
  // ────────────────────────────────────────────────────────────────────────
  describe('arrow functions with template literal expression bodies', () => {
    it('handles single-param arrow with multi-line template body in .map()', async () => {
      const dir = tmp()
      const src = [
        'const envs = [{ name: "prod", branch: "main" }, { name: "staging", branch: "develop" }]',
        'const jobs = envs.map(env => `',
        '  deploy-${env.name}:',
        '    executor: bun-executor',
        '    steps:',
        '      - checkout',
        '      - run:',
        '          name: Deploy to ${env.name}',
        '          command: bun run deploy --env=${env.name}',
        '`).join("\\n")',
        'console.log(jobs)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles parenthesized arrow with multi-line template body in .map()', async () => {
      const dir = tmp()
      const src = [
        'interface Env { name: string; branch: string }',
        'const environments: Env[] = []',
        'const workflowJobs = environments.map((env) => `',
        '      - deploy-${env.name}:',
        '          requires:',
        '            - build',
        '          filters:',
        '            branches:',
        '              only: ${env.branch}',
        '`).join("")',
        'console.log(workflowJobs)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles arrow function with single-line template expression body', async () => {
      const dir = tmp()
      const src = [
        'const names = ["alice", "bob"]',
        'const greetings = names.map(name => `Hello, ${name}!`)',
        'console.log(greetings)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('correctly flags unused param in arrow with template body', async () => {
      const dir = tmp()
      const src = [
        'const items = [1, 2, 3]',
        'const result = items.map(item => `hello world`)',
        'console.log(result)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1) // item is not used in the template
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 4. Generated code inside template literals (should NOT trigger false positives)
  // ────────────────────────────────────────────────────────────────────────
  describe('generated code inside template literals', () => {
    it('does not flag arrow functions inside template literal content', async () => {
      const dir = tmp()
      const src = [
        'function generateHandler(bucket: string): string {',
        '  return `',
        'exports.handler = async (event) => {',
        '  const s3 = new AWS.S3()',
        '  const params = {',
        '    Bucket: "${bucket}",',
        '    Key: event.Records[0].s3.object.key',
        '  }',
        '  return await s3.getObject(params).promise()',
        '}',
        '`',
        '}',
        'generateHandler("my-bucket")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0) // bucket IS used, and (event) => inside template should not be detected
    })

    it('does not flag function declarations inside template literal content', async () => {
      const dir = tmp()
      const src = [
        'function generateLambda(region: string): string {',
        '  return `',
        'import * as AWS from "aws-sdk"',
        '',
        'const client = new AWS.DynamoDB({ region: "${region}" })',
        '',
        'export async function handler(event: any) {',
        '  const records = event.Records',
        '  for (const record of records) {',
        '    await client.putItem({ TableName: "table", Item: record }).promise()',
        '  }',
        '  return { statusCode: 200 }',
        '}',
        '`',
        '}',
        'generateLambda("us-east-1")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('does not flag variables inside generated CloudFormation template', async () => {
      const dir = tmp()
      const src = [
        'function generateTemplate(config: { name: string; runtime: string }): string {',
        '  return `',
        'AWSTemplateFormatVersion: "2010-09-09"',
        'Resources:',
        '  ${config.name}Function:',
        '    Type: AWS::Lambda::Function',
        '    Properties:',
        '      Runtime: ${config.runtime}',
        '      Handler: index.handler',
        '      Code:',
        '        ZipFile: |',
        '          exports.handler = async function(event, context) {',
        '            const response = {',
        '              statusCode: 200,',
        '              body: JSON.stringify({ message: "Hello" })',
        '            }',
        '            return response',
        '          }',
        '`',
        '}',
        'generateTemplate({ name: "MyFunc", runtime: "nodejs18.x" })',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 5. Complex function bodies with nested template literals and braces
  // ────────────────────────────────────────────────────────────────────────
  describe('complex function bodies with templates', () => {
    it('handles function with multiple template expressions referencing params', async () => {
      const dir = tmp()
      const src = [
        'export function generateMultiEnvConfig(options: {',
        '  environments: Array<{ name: string; branch: string }>',
        '  awsRegion?: string',
        '}): string {',
        '  const { environments, awsRegion = "us-east-1" } = options',
        '',
        '  const deployJobs = environments.map(env => `',
        '  deploy-${env.name}:',
        '    executor: bun-executor',
        '    steps:',
        '      - run:',
        '          name: Deploy to ${env.name}',
        '          command: bun run deploy --env=${env.name}',
        '`).join("\\n")',
        '',
        '  const workflowJobs = environments.map(env => `',
        '      - deploy-${env.name}:',
        '          filters:',
        '            branches:',
        '              only: ${env.branch}',
        '`).join("")',
        '',
        '  return `version: 2.1',
        'executors:',
        '  bun-executor:',
        '    docker:',
        '      - image: oven/bun:latest',
        '    environment:',
        '      AWS_DEFAULT_REGION: ${awsRegion}',
        'jobs:',
        '  test:',
        '    executor: bun-executor',
        '${deployJobs}',
        'workflows:',
        '  jobs:',
        '    - test',
        '${workflowJobs}',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles function with scheduled cron config', async () => {
      const dir = tmp()
      const src = [
        'export function generateScheduledConfig(options: {',
        '  schedule: string',
        '  environment: string',
        '  awsRegion?: string',
        '}): string {',
        '  const { schedule, environment, awsRegion = "us-east-1" } = options',
        '',
        '  return `version: 2.1',
        'executors:',
        '  bun-executor:',
        '    docker:',
        '      - image: oven/bun:latest',
        '    environment:',
        '      AWS_DEFAULT_REGION: ${awsRegion}',
        '      ENVIRONMENT: ${environment}',
        'workflows:',
        '  scheduled-deployment:',
        '    triggers:',
        '      - schedule:',
        '          cron: "${schedule}"',
        '          filters:',
        '            branches:',
        '              only: main',
        '    jobs:',
        '      - deploy',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 6. Escaped backticks and special chars in template literals
  // ────────────────────────────────────────────────────────────────────────
  describe('escaped characters in templates', () => {
    it('handles escaped backtick inside template literal', async () => {
      const dir = tmp()
      const src = [
        'function formatCode(code: string): string {',
        '  return `\\`\\`\\`typescript',
        '${code}',
        '\\`\\`\\``',
        '}',
        'formatCode("const x = 1")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles escaped ${} inside template literal', async () => {
      const dir = tmp()
      const src = [
        'function generateScript(envVar: string): string {',
        '  return `#!/bin/bash',
        'echo "Using: ${envVar}"',
        'echo "Escaped: \\${HOME}"',
        '`',
        '}',
        'generateScript("MY_VAR")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 7. Template literals with object expressions in ${}
  // ────────────────────────────────────────────────────────────────────────
  describe('template literals with object expressions', () => {
    it('handles ${JSON.stringify({...})} in template', async () => {
      const dir = tmp()
      const src = [
        'function generateJson(name: string, value: number): string {',
        '  return `config: ${JSON.stringify({ name, value })}`',
        '}',
        'generateJson("test", 42)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles multi-line ${} with object literal spanning lines', async () => {
      const dir = tmp()
      const src = [
        'function generateConfig(port: number, host: string): string {',
        '  return `server ${JSON.stringify({',
        '    port,',
        '    host,',
        '    protocol: "https"',
        '  })}`',
        '}',
        'generateConfig(3000, "localhost")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 8. Arrow with complex chained template expressions
  // ────────────────────────────────────────────────────────────────────────
  describe('chained arrow expressions with templates', () => {
    it('handles .map().join() with multi-line template', async () => {
      const dir = tmp()
      const src = [
        'interface Step { name: string; command: string }',
        'function generateSteps(steps: Step[]): string {',
        '  return steps.map(step => `',
        '      - run:',
        '          name: ${step.name}',
        '          command: ${step.command}',
        '`).join("")',
        '}',
        'generateSteps([])',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles nested .map() calls each with template bodies', async () => {
      const dir = tmp()
      const src = [
        'interface Job { name: string; steps: string[] }',
        'function generateJobs(jobs: Job[]): string {',
        '  return jobs.map(job => `',
        '  ${job.name}:',
        '    steps:',
        '${job.steps.map(s => `      - run: ${s}`).join("\\n")}',
        '`).join("\\n")',
        '}',
        'generateJobs([])',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles .filter().map() chain with templates', async () => {
      const dir = tmp()
      const src = [
        'const items = [{ active: true, name: "a" }, { active: false, name: "b" }]',
        'const result = items',
        '  .filter(item => item.active)',
        '  .map(item => `<li>${item.name}</li>`)',
        '  .join("\\n")',
        'console.log(result)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 9. Function body detection with various brace patterns
  // ────────────────────────────────────────────────────────────────────────
  describe('function body detection edge cases', () => {
    it('handles URLs with // in multi-line template (not treated as comment)', async () => {
      const dir = tmp()
      const src = [
        'function deploy(config: any, region: string): void {',
        '  const sites = config.sites || {}',
        '  for (const siteName of Object.keys(sites)) {',
        '    const domain = sites[siteName].domain',
        '    if (!domain) continue',
        '    const result = { success: true, domain, bucket: "b" }',
        '    if (result.success) {',
        '      console.log(`Site:',
        '',
        'Domain: https://${result.domain}',
        'Bucket: ${result.bucket}',
        'Region: ${region}',
        '',
        'Done at https://${result.domain}`)',
        '    }',
        '  }',
        '}',
        'deploy({}, "us-east-1")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles function with string containing braces', async () => {
      const dir = tmp()
      const src = [
        'function check(text: string): boolean {',
        '  return text.includes("{") || text.includes("}")',
        '}',
        'check("test")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles function with template containing braces', async () => {
      const dir = tmp()
      const src = [
        'function wrap(content: string): string {',
        '  return `{',
        '  ${content}',
        '}`',
        '}',
        'wrap("hello")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles function with regex containing braces', async () => {
      const dir = tmp()
      const src = [
        'function countBraces(text: string): number {',
        '  const matches = text.match(/\\{[^}]*\\}/g)',
        '  return matches ? matches.length : 0',
        '}',
        'countBraces("a{b}c")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles arrow function returning template with nested braces', async () => {
      const dir = tmp()
      const src = [
        'const makeJson = (key: string, value: string) => {',
        '  return `{ "${key}": "${value}" }`',
        '}',
        'console.log(makeJson("a", "b"))',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 10. Real-world patterns: CI/CD config generators
  // ────────────────────────────────────────────────────────────────────────
  describe('real-world CI/CD config generators', () => {
    it('handles GitHub Actions workflow generator', async () => {
      const dir = tmp()
      const src = [
        'export function generateGitHubActions(options: {',
        '  nodeVersion?: string',
        '  testCommand?: string',
        '  deployCommand?: string',
        '} = {}): string {',
        '  const {',
        '    nodeVersion = "18",',
        '    testCommand = "npm test",',
        '    deployCommand = "npm run deploy",',
        '  } = options',
        '',
        '  return `name: CI/CD',
        'on:',
        '  push:',
        '    branches: [main]',
        '',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - uses: actions/setup-node@v4',
        '        with:',
        '          node-version: ${nodeVersion}',
        '      - run: npm ci',
        '      - run: ${testCommand}',
        '',
        '  deploy:',
        '    needs: test',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: ${deployCommand}',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles GitLab CI generator with environments', async () => {
      const dir = tmp()
      const src = [
        'export function generateGitLabCI(options: {',
        '  stages?: string[]',
        '  image?: string',
        '  deployTarget?: string',
        '}): string {',
        '  const { stages = ["test", "build", "deploy"], image = "node:18", deployTarget = "production" } = options',
        '',
        '  return `image: ${image}',
        '',
        'stages:',
        '${stages.map(s => `  - ${s}`).join("\\n")}',
        '',
        'test:',
        '  stage: test',
        '  script:',
        '    - npm ci',
        '    - npm test',
        '',
        'deploy:',
        '  stage: deploy',
        '  script:',
        '    - npm run deploy -- --target=${deployTarget}',
        '  environment: ${deployTarget}',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 11. Real-world patterns: Lambda/serverless code generators
  // ────────────────────────────────────────────────────────────────────────
  describe('real-world Lambda code generators', () => {
    it('handles S3 event handler generator', async () => {
      const dir = tmp()
      const src = [
        'function generateS3Handler(bucket: string, region: string): string {',
        '  return `',
        'import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"',
        '',
        'const client = new S3Client({ region: "${region}" })',
        '',
        'export const handler = async (event) => {',
        '  for (const record of event.Records) {',
        '    const key = record.s3.object.key',
        '    const command = new GetObjectCommand({',
        '      Bucket: "${bucket}",',
        '      Key: key,',
        '    })',
        '    const response = await client.send(command)',
        '    console.log("Processed:", key)',
        '  }',
        '  return { statusCode: 200 }',
        '}',
        '`',
        '}',
        'generateS3Handler("my-bucket", "us-east-1")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles DynamoDB stream handler generator', async () => {
      const dir = tmp()
      const src = [
        'function generateDynamoHandler(tableName: string): string {',
        '  return `',
        'exports.handler = async function(event, context) {',
        '  console.log("Table: ${tableName}")',
        '  for (const record of event.Records) {',
        '    if (record.eventName === "INSERT") {',
        '      const newImage = record.dynamodb.NewImage',
        '      console.log("New item:", JSON.stringify(newImage))',
        '    }',
        '  }',
        '  return { batchItemFailures: [] }',
        '}',
        '`',
        '}',
        'generateDynamoHandler("my-table")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles SQS handler generator with multiple template vars', async () => {
      const dir = tmp()
      const src = [
        'function generateSqsHandler(queueUrl: string, dlqUrl: string, maxRetries: number): string {',
        '  return `',
        'const QUEUE_URL = "${queueUrl}"',
        'const DLQ_URL = "${dlqUrl}"',
        'const MAX_RETRIES = ${maxRetries}',
        '',
        'export const handler = async (event) => {',
        '  const failedIds = []',
        '  for (const record of event.Records) {',
        '    try {',
        '      await processMessage(record.body)',
        '    } catch (err) {',
        '      failedIds.push(record.messageId)',
        '    }',
        '  }',
        '  return { batchItemFailures: failedIds.map(id => ({ itemIdentifier: id })) }',
        '}',
        '`',
        '}',
        'generateSqsHandler("url", "dlq", 3)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 12. Multi-line ${} expressions
  // ────────────────────────────────────────────────────────────────────────
  describe('multi-line ${} expressions', () => {
    it('handles ${arr.map(...).join()} spanning multiple lines', async () => {
      const dir = tmp()
      const src = [
        'function renderList(items: string[]): string {',
        '  return `<ul>',
        '${items',
        '    .map(item => `<li>${item}</li>`)',
        '    .join("\\n")}',
        '</ul>`',
        '}',
        'renderList(["a", "b"])',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles ${condition \\n ? value \\n : other} spanning lines', async () => {
      const dir = tmp()
      const src = [
        'function renderBanner(showBanner: boolean, title: string): string {',
        '  return `<div>',
        '${showBanner',
        '    ? `<h1>${title}</h1>`',
        '    : ""}',
        '</div>`',
        '}',
        'renderBanner(true, "Welcome")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 13. Callback parameters in various patterns
  // ────────────────────────────────────────────────────────────────────────
  describe('callback parameters', () => {
    it('handles event handler callbacks', async () => {
      const dir = tmp()
      const src = [
        'interface Emitter { on(event: string, cb: (data: any) => void): void }',
        'function setupHandlers(emitter: Emitter) {',
        '  emitter.on("data", (data) => {',
        '    console.log(data)',
        '  })',
        '  emitter.on("error", (err) => {',
        '    console.error(err)',
        '  })',
        '}',
        'setupHandlers({} as any)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles Promise.then/catch chains', async () => {
      const dir = tmp()
      const src = [
        'function fetchData(url: string) {',
        '  return fetch(url)',
        '    .then(response => response.json())',
        '    .then(data => data.value)',
        '    .catch(error => { throw error })',
        '}',
        'fetchData("https://example.com")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles Array.reduce with accumulator and current', async () => {
      const dir = tmp()
      const src = [
        'const nums = [1, 2, 3]',
        'const sum = nums.reduce((acc, num) => acc + num, 0)',
        'console.log(sum)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 14. Complex TypeScript patterns
  // ────────────────────────────────────────────────────────────────────────
  describe('complex TypeScript patterns', () => {
    it('handles generic function with constraint used in body', async () => {
      const dir = tmp()
      const src = [
        'function merge<T extends Record<string, unknown>>(a: T, b: T): T {',
        '  return { ...a, ...b }',
        '}',
        'merge({}, {})',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles function with tuple return type', async () => {
      const dir = tmp()
      const src = [
        'function split(input: string): [string, string] {',
        '  const idx = input.indexOf(",")',
        '  return [input.slice(0, idx), input.slice(idx + 1)]',
        '}',
        'split("a,b")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles async function with complex return type and template body', async () => {
      const dir = tmp()
      const src = [
        'async function deploy(config: {',
        '  stack: string',
        '  region: string',
        '  account: string',
        '}): Promise<{ stackId: string; status: string }> {',
        '  const template = `',
        'AWSTemplateFormatVersion: "2010-09-09"',
        'Description: Deploy ${config.stack} to ${config.region}',
        'Resources:',
        '  MainStack:',
        '    Type: AWS::CloudFormation::Stack',
        '    Properties:',
        '      TemplateURL: https://${config.account}.s3.amazonaws.com/${config.stack}',
        '`',
        '  console.log(template)',
        '  return { stackId: "id", status: "ok" }',
        '}',
        'deploy({ stack: "app", region: "us-east-1", account: "123" })',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles overloaded function signatures', async () => {
      const dir = tmp()
      const src = [
        'function format(value: string): string',
        'function format(value: number): string',
        'function format(value: string | number): string {',
        '  return `formatted: ${value}`',
        '}',
        'format("test")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 15. Mixed content: strings, templates, and code together
  // ────────────────────────────────────────────────────────────────────────
  describe('mixed string types in function bodies', () => {
    it('handles function with mix of single quotes, double quotes, and templates', async () => {
      const dir = tmp()
      const src = [
        'function buildUrl(base: string, path: string, query: string): string {',
        '  const protocol = "https"',
        '  const separator = \'/\'',
        '  return `${protocol}://${base}${separator}${path}?${query}`',
        '}',
        'buildUrl("example.com", "api", "key=val")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles template with single quotes and double quotes inside', async () => {
      const dir = tmp()
      const src = [
        'function generateHtml(title: string, className: string): string {',
        '  return `<div class="${className}">',
        '  <h1 style=\'color: red\'>${title}</h1>',
        '</div>`',
        '}',
        'generateHtml("Hello", "main")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 16. Edge case: truly unused params should still be flagged
  // ────────────────────────────────────────────────────────────────────────
  describe('correctly flags truly unused parameters', () => {
    it('flags unused variable declared alongside used ones', async () => {
      const dir = tmp()
      const src = [
        'const region = "us-east-1"',
        'const image = "node:latest"',
        'const unused = "default"',
        'console.log(`region: ${region}, image: ${image}`)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1) // unused IS unused
    })

    it('flags param not used in template expression', async () => {
      const dir = tmp()
      const src = [
        'function greet(name: string, age: number): string {',
        '  return `Hello, ${name}!`',
        '}',
        'greet("Alice", 30)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1) // age is not used
    })

    it('flags param in arrow with empty template body', async () => {
      const dir = tmp()
      const src = [
        'const items = [1, 2, 3]',
        'const labels = items.map(item => ``)',
        'console.log(labels)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(1) // item is not used
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 17. Comprehensive real-world: SMS/phone analytics handler pattern
  // ────────────────────────────────────────────────────────────────────────
  describe('real-world event handler patterns', () => {
    it('handles analytics event handler with switch statement', async () => {
      const dir = tmp()
      const src = [
        'interface AnalyticsEvent { type: string; data: any }',
        'export function handleEvent(event: AnalyticsEvent): void {',
        '  switch (event.type) {',
        '    case "pageview":',
        '      console.log("Page:", event.data.url)',
        '      break',
        '    case "click":',
        '      console.log("Click:", event.data.target)',
        '      break',
        '    default:',
        '      console.log("Unknown event:", event.type)',
        '  }',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles multi-account config structure', async () => {
      const dir = tmp()
      const src = [
        'interface AccountStructure {',
        '  accounts: Array<{ name: string; id: string }>',
        '  region: string',
        '}',
        '',
        'export function generateMultiAccountConfig(structure: AccountStructure): string {',
        '  return `',
        'accounts:',
        '${structure.accounts.map(acc => `  - name: ${acc.name}',
        '    id: ${acc.id}`).join("\\n")}',
        '',
        'default_region: ${structure.region}',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 18. Variables used only inside template literal interpolations
  // ────────────────────────────────────────────────────────────────────────
  describe('variables used only in template interpolations', () => {
    it('recognizes variable used only in ${} interpolation', async () => {
      const dir = tmp()
      const src = [
        'const name = "world"',
        'const greeting = `hello ${name}`',
        'console.log(greeting)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('recognizes variable used only in multi-line template', async () => {
      const dir = tmp()
      const src = [
        'const version = "2.1"',
        'const config = `',
        'version: ${version}',
        'settings:',
        '  enabled: true',
        '`',
        'console.log(config)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 19. Arrow functions with block body containing templates
  // ────────────────────────────────────────────────────────────────────────
  describe('arrow functions with block body and templates inside', () => {
    it('handles arrow with block body returning template', async () => {
      const dir = tmp()
      const src = [
        'const render = (title: string, items: string[]) => {',
        '  const list = items.map(i => `<li>${i}</li>`).join("")',
        '  return `<div>',
        '  <h1>${title}</h1>',
        '  <ul>${list}</ul>',
        '</div>`',
        '}',
        'console.log(render("Test", ["a", "b"]))',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles single-param arrow with block body and template', async () => {
      const dir = tmp()
      const src = [
        'const format = (value: number) => {',
        '  if (value > 1000) return `${(value / 1000).toFixed(1)}k`',
        '  return `${value}`',
        '}',
        'console.log(format(1500))',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 20. Various patterns that have caused issues in practice
  // ────────────────────────────────────────────────────────────────────────
  describe('patterns that commonly cause false positives', () => {
    it('handles function with options = {} default and template body', async () => {
      const dir = tmp()
      const src = [
        'export function createStack(options: Record<string, string> = {}): string {',
        '  const region = options.region || "us-east-1"',
        '  const name = options.name || "default"',
        '  return `',
        'Stack: ${name}',
        'Region: ${region}',
        '`',
        '}',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles function where param appears only in nested arrow body', async () => {
      const dir = tmp()
      const src = [
        'function processItems(items: string[], prefix: string) {',
        '  return items.map(item => `${prefix}-${item}`)',
        '}',
        'processItems(["a"], "x")',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles nested function declarations', async () => {
      const dir = tmp()
      const src = [
        'function outer(x: number) {',
        '  function inner(y: number) {',
        '    return x + y',
        '  }',
        '  return inner(1)',
        '}',
        'outer(5)',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })

    it('handles for...of with destructuring in template', async () => {
      const dir = tmp()
      const src = [
        'interface Entry { key: string; value: string }',
        'function serialize(entries: Entry[]): string {',
        '  let result = ""',
        '  for (const entry of entries) {',
        '    result += `${entry.key}=${entry.value}\\n`',
        '  }',
        '  return result',
        '}',
        'serialize([])',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'a.ts'), src, 'utf8')
      const code = await runLint([dir], { config: makeConfig(dir), reporter: 'json' })
      expect(code).toBe(0)
    })
  })
})
