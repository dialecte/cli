import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles, temporaryFolder } from '../../test/scratch-repository.ts'
import { runNewVerb } from './new-verb.ts'

import { describe, expect, it } from 'vitest'

const EXTENSIONS = 'src/v1/extensions'

/** A package shaped like a generated dialecte with a `greeting` extension holding one query. */
function dialectePackage(extra: Record<string, string> = {}): string {
	const root = temporaryFolder('dialecte-new-verb-')
	writeFiles({
		root,
		files: {
			'package.json': JSON.stringify({ name: '@dialecte/demo' }),
			'src/v1/definition/constants.generated.ts': "export const ROOT_ELEMENT = 'Root' as const\n",
			'src/v1/definition/definition.generated.ts': 'export const DEFINITION = {}\n',
			[`${EXTENSIONS}/index.ts`]: [
				"import { greeting } from './greeting'",
				'',
				'export const DEMO_EXTENSION_MODULES = {',
				'\tgreeting,',
				'}',
				'',
			].join('\n'),
			[`${EXTENSIONS}/greeting/index.ts`]: [
				"import * as greetingQueries from './query'",
				'',
				'export const greeting = {',
				'\tquery: greetingQueries,',
				'}',
				'',
			].join('\n'),
			[`${EXTENSIONS}/greeting/query/index.ts`]: "export { sayHello } from './say-hello'\n",
			...extra,
		},
	})
	return root
}

/** A file of the package, as text. */
function reader(root: string): (path: string) => string {
	return function read(path: string): string {
		return readFileSync(join(root, path), 'utf8')
	}
}

describe('runNewVerb', () => {
	it('a query in a new namespace → verb, types and red test written, namespace created and registered', () => {
		const root = dialectePackage()
		const read = reader(root)

		const result = runNewVerb({
			cwd: root,
			argv: ['verb', 'cleanUp', 'query', 'findOrphans', '--no-format'],
		})

		expect(result.exitCode).toBe(0)
		expect(read(`${EXTENSIONS}/clean-up/query/find-orphans.ts`)).toBe(
			[
				"import type { FindOrphansParams, FindOrphansResult } from './find-orphans.types'",
				"import type { Config } from '@/v1/config'",
				"import type * as Core from '@dialecte/core'",
				'',
				'/**',
				' * FILL: what it answers, in one sentence.',
				' *',
				' * @intent FILL: what a caller is trying to do when this is the method to reach for',
				' */',
				'export async function findOrphans(',
				'\tquery: Core.Query<Config>,',
				'\tparams: FindOrphansParams,',
				'): Promise<FindOrphansResult> {',
				"\tthrow new Error('cleanUp.findOrphans: FILL: the implementation, red test first')",
				'}',
				'',
			].join('\n'),
		)
		expect(read(`${EXTENSIONS}/clean-up/query/index.ts`)).toBe(
			"export { findOrphans } from './find-orphans'\n",
		)
		expect(read(`${EXTENSIONS}/clean-up/index.ts`)).toBe(
			[
				"import * as cleanUpQueries from './query'",
				'',
				'export const cleanUp = {',
				'\tquery: cleanUpQueries,',
				'}',
				'',
			].join('\n'),
		)
		expect(read(`${EXTENSIONS}/index.ts`)).toBe(
			[
				"import { greeting } from './greeting'",
				"import { cleanUp } from './clean-up'",
				'',
				'export const DEMO_EXTENSION_MODULES = {',
				'\tgreeting,',
				'\tcleanUp,',
				'}',
				'',
			].join('\n'),
		)
		const test = read(`${EXTENSIONS}/clean-up/query/find-orphans.test.ts`)
		expect(test).toContain('run' + 'DemoTestCases.withoutExport({ testCases, act })')
		expect(test).not.toContain('only: true')
		expect(result.output).toContain('npx dialecte tdd red')
		expect(test).toContain('<Root ${ns} ${id}="root">')
		expect(test).toContain('await source.query.cleanUp.findOrphans({})')
		expect(result.output).toContain(`written  ${EXTENSIONS}/clean-up/query/find-orphans.types.ts`)
		expect(result.output).toContain(`edited   ${EXTENSIONS}/index.ts`)
		expect(result.output).toContain(`fill     ${EXTENSIONS}/clean-up/query/find-orphans.ts:6`)
	})

	it('a first transaction in a namespace holding queries → its group added to the namespace, registry untouched', () => {
		const root = dialectePackage()
		const read = reader(root)
		const registry = read(`${EXTENSIONS}/index.ts`)

		const result = runNewVerb({
			cwd: root,
			argv: ['verb', 'greeting', 'transaction', 'addGreeting', '--no-format'],
		})

		expect(result.exitCode).toBe(0)
		expect(read(`${EXTENSIONS}/greeting/index.ts`)).toBe(
			[
				"import * as greetingQueries from './query'",
				"import * as greetingTransactions from './transaction'",
				'',
				'export const greeting = {',
				'\tquery: greetingQueries,',
				'\ttransaction: greetingTransactions,',
				'}',
				'',
			].join('\n'),
		)
		expect(read(`${EXTENSIONS}/index.ts`)).toBe(registry)
		const test = read(`${EXTENSIONS}/greeting/transaction/add-greeting.test.ts`)
		expect(test).toContain('await tx.greeting.addGreeting({})')
		expect(test).toContain('run' + 'DemoTestCases.withExport({ testCases, act })')
	})

	it('a query in a namespace that has queries → only the barrel gains its export', () => {
		const root = dialectePackage()
		const read = reader(root)

		const result = runNewVerb({
			cwd: root,
			argv: ['verb', 'greeting', 'query', 'sayBye', '--no-format'],
		})

		expect(result.exitCode).toBe(0)
		expect(read(`${EXTENSIONS}/greeting/query/index.ts`)).toBe(
			"export { sayHello } from './say-hello'\nexport { sayBye } from './say-bye'\n",
		)
		expect(result.output.split('\n').filter((line) => line.startsWith('edited'))).toEqual([
			`edited   ${EXTENSIONS}/greeting/query/index.ts`,
		])
	})

	it('the verb exists already → refused, nothing written', () => {
		const root = dialectePackage({ [`${EXTENSIONS}/greeting/query/say-hello.ts`]: 'x' })

		const result = runNewVerb({
			cwd: root,
			argv: ['verb', 'greeting', 'query', 'sayHello', '--no-format'],
		})

		expect(result).toEqual({
			exitCode: 1,
			output: `new verb: already there: ${EXTENSIONS}/greeting/query/say-hello.ts, nothing written`,
		})
		expect(existsSync(join(root, `${EXTENSIONS}/greeting/query/say-hello.types.ts`))).toBe(false)
	})

	it('two versions and no --version, a kebab-case name, or a missing word → usage error', () => {
		const root = dialectePackage({
			'src/v2/definition/constants.generated.ts': '',
			'src/v2/definition/definition.generated.ts': '',
		})

		expect(runNewVerb({ cwd: root, argv: ['verb', 'greeting', 'query', 'sayBye'] })).toEqual({
			exitCode: 2,
			output: 'new verb: pick a version with --version (v1, v2)',
		})
		expect(runNewVerb({ cwd: root, argv: ['verb', 'greeting', 'query', 'say-bye'] }).exitCode).toBe(
			2,
		)
		expect(runNewVerb({ cwd: root, argv: ['verb', 'greeting', 'query'] }).exitCode).toBe(2)
	})

	it('a barrel without its last newline → the export goes on a line of its own', () => {
		const root = dialectePackage({
			[`${EXTENSIONS}/greeting/query/index.ts`]: "export { sayHello } from './say-hello'",
		})
		const read = reader(root)

		runNewVerb({ cwd: root, argv: ['verb', 'greeting', 'query', 'sayBye', '--no-format'] })

		expect(read(`${EXTENSIONS}/greeting/query/index.ts`)).toBe(
			"export { sayHello } from './say-hello'\nexport { sayBye } from './say-bye'\n",
		)
	})

	it('the formatter fails → exit 1, saying the files are written but not formatted', () => {
		const root = dialectePackage()

		const result = runNewVerb({
			cwd: root,
			argv: ['verb', 'greeting', 'query', 'sayBye', '--format-config', join(root, 'missing.json')],
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('the formatter failed')
	})
})
