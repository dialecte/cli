import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { runNewVerb } from '../src/commands/new-verb.ts'
import { runRules } from '../src/commands/rules.ts'
import { temporaryFolder, writeFiles } from './scratch-repository.ts'

import { describe, expect, it } from 'vitest'

const CLI_ROOT = join(import.meta.dirname, '..')

/**
 * A dialecte package reduced to the contract a scaffolded verb relies on: core's `Query` and
 * `Transaction`, the version's `Config`, the extension registry, and test runners whose `source`
 * reaches each extension method with its first parameter dropped, as core binds them.
 */
function dialecteFixture(): string {
	const root = temporaryFolder('dialecte-new-verb-fixture-')
	writeFiles({
		root,
		files: {
			'package.json': JSON.stringify({ name: '@dialecte/demo' }),
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					types: [],
					paths: {
						'@/*': ['./src/*'],
						'@dialecte/core': ['./core/index.ts'],
						vitest: [join(CLI_ROOT, 'node_modules/vitest')],
					},
				},
				include: ['src'],
			}),
			'core/index.ts': [
				'export type Query<GenericConfig> = { readonly config: GenericConfig }',
				'export type Transaction<GenericConfig> = Query<GenericConfig> & { readonly writes: true }',
				'',
			].join('\n'),
			'src/v1/definition/constants.generated.ts': "export const ROOT_ELEMENT = 'Root' as const\n",
			'src/v1/definition/definition.generated.ts': 'export const DEFINITION = {}\n',
			'src/v1/config/index.ts': "export type Config = { rootElementName: 'Root' }\n",
			'src/v1/extensions/index.ts': [
				"import { greeting } from './greeting'",
				'',
				'export const DEMO_EXTENSION_MODULES = {',
				'\tgreeting,',
				'}',
				'',
			].join('\n'),
			'src/v1/extensions/greeting/index.ts': [
				"import * as greetingQueries from './query'",
				'',
				'export const greeting = {',
				'\tquery: greetingQueries,',
				'}',
				'',
			].join('\n'),
			'src/v1/extensions/greeting/query/index.ts': "export { sayHello } from './say-hello'\n",
			'src/v1/extensions/greeting/query/say-hello.ts': [
				"import type { Config } from '@/v1/config'",
				"import type * as Core from '@dialecte/core'",
				'',
				'export async function sayHello(query: Core.Query<Config>): Promise<string> {',
				'\treturn String(query.config.rootElementName)',
				'}',
				'',
			].join('\n'),
			'src/v1/test/index.ts': [
				"import type { DEMO_EXTENSION_MODULES } from '@/v1/extensions'",
				'',
				'type Bound<GenericModule> = {',
				'\t[Name in keyof GenericModule]: GenericModule[Name] extends (',
				'\t\tfirst: never,',
				'\t\t...rest: infer Rest',
				'\t) => infer Result',
				'\t\t? (...rest: Rest) => Result',
				'\t\t: never',
				'}',
				'type Modules = typeof DEMO_EXTENSION_MODULES',
				'type Group<GenericKey extends string> = {',
				'\t[Name in keyof Modules]: Modules[Name] extends Record<GenericKey, infer Group> ? Bound<Group> : never',
				'}',
				'',
				'export declare namespace DemoTest {',
				'\ttype BaseXmlTestCase = {',
				'\t\tsourceXml: string',
				'\t\tonly?: boolean',
				'\t\texpectedQueries?: string[]',
				'\t\tunexpectedQueries?: string[]',
				'\t}',
				'\ttype TestCases<GenericCase extends BaseXmlTestCase> = Record<string, GenericCase>',
				'\ttype ActParams<GenericCase> = {',
				'\t\ttestCase: GenericCase',
				'\t\tsource: {',
				"\t\t\tquery: Group<'query'>",
				"\t\t\ttransaction(run: (tx: Group<'transaction'>) => Promise<void>): Promise<void>",
				'\t\t}',
				'\t}',
				"\ttype ActResult = { assertOn: 'source' }",
				'}',
				'',
				'export declare const runDemoTestCases: {',
				'\twithoutExport<GenericCase extends DemoTest.BaseXmlTestCase>(params: {',
				'\t\ttestCases: DemoTest.TestCases<GenericCase>',
				'\t\tact: (params: DemoTest.ActParams<GenericCase>) => Promise<void>',
				'\t}): void',
				'\twithExport<GenericCase extends DemoTest.BaseXmlTestCase>(params: {',
				'\t\ttestCases: DemoTest.TestCases<GenericCase>',
				'\t\tact: (params: DemoTest.ActParams<GenericCase>) => Promise<DemoTest.ActResult>',
				'\t}): void',
				'}',
				'export declare const ALL_XMLNS_NAMESPACES: string',
				'export declare const CUSTOM_RECORD_ID_ATTRIBUTE: string',
				'',
			].join('\n'),
		},
	})
	return root
}

/** The cli's own tsc (TypeScript 7, as `type-check`), run by node: through npx, npm 12 prints `npm notice run` lines. */
const TSC = join(CLI_ROOT, 'node_modules/@typescript/native/bin/tsc')

function typeCheck(root: string): { status: number | null; output: string } {
	const result = spawnSync(process.execPath, [TSC, '-p', join(root, 'tsconfig.json')], {
		cwd: CLI_ROOT,
		encoding: 'utf8',
	})
	return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('dialecte new verb on a dialecte-shaped package', { timeout: 60_000 }, () => {
	it('a query in a new namespace and a first transaction in an existing one → the package type-checks and rules are clean', () => {
		const root = dialecteFixture()
		expect(typeCheck(root)).toEqual({ status: 0, output: '' })

		const query = runNewVerb({ cwd: root, argv: ['verb', 'cleanUp', 'query', 'findOrphans'] })
		const transaction = runNewVerb({
			cwd: root,
			argv: ['verb', 'greeting', 'transaction', 'addGreeting'],
		})

		expect([query.exitCode, transaction.exitCode]).toEqual([0, 0])
		expect(typeCheck(root)).toEqual({ status: 0, output: '' })
		const touched = [query.output, transaction.output]
			.join('\n')
			.split('\n')
			.filter((line) => /^(written|edited) /.test(line))
			.map((line) => line.replace(/^(written|edited) +/, ''))
		expect(runRules({ cwd: root, argv: touched })).toEqual({
			exitCode: 0,
			output: `rules: ${touched.length} file(s), 0 error(s), 0 warning(s)`,
		})
	})
})
