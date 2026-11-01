import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverExports, discoverMethods } from '../src/lib/discover.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MethodEntry } from '../src/lib/discover.types.ts'

/** Builds a TypeScript program per call: wide slack for a loaded shared machine. */
const PROGRAM_TEST_TIMEOUT = 120_000

let root: string

function write(path: string, content: string): void {
	mkdirSync(join(root, path, '..'), { recursive: true })
	writeFileSync(join(root, path), content)
}

const FN_SOURCE = [
	'/** Reads fn. @intent read fn */',
	'export function fn(): string {',
	"\treturn 'fn'",
	'}',
	'',
].join('\n')
const SHARED_SOURCE = [
	'/** Shared by a root and an entry. @intent share */',
	'export function shared(): string {',
	"\treturn 'shared'",
	'}',
	'',
].join('\n')

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-discover-exports-'))
	write(
		'tsconfig.json',
		JSON.stringify({
			compilerOptions: {
				strict: true,
				module: 'esnext',
				moduleResolution: 'bundler',
				target: 'es2022',
				noEmit: true,
			},
		}),
	)
	write('node_modules/dep/package.json', JSON.stringify({ name: 'dep', types: 'index.d.ts' }))
	write(
		'node_modules/dep/index.d.ts',
		[
			'/** Reads a thing from the dependency. @intent read a thing */',
			'export declare function depFunction(id: string): string',
			'',
		].join('\n'),
	)
	write(
		'src/sqlite.ts',
		[
			"export { depFunction } from 'dep'",
			'',
			'/**',
			' * Connects to the hub of a project.',
			' *',
			' * @intent open a connection to the hub, reach the shared engine',
			' */',
			'export function connectHub(params: { name: string; retries?: number }, signal: AbortSignal): string {',
			'	return params.name',
			'}',
			'',
			'/** Counts the rows. @intent count rows */',
			'export const countRows = (table: string, limit: number): number => limit',
			'',
			'export function undocumented(value: string): string {',
			'	return value',
			'}',
			'',
			'/** Plumbing for the engine. @internal */',
			'export function plumbing(): void {}',
			'',
			'/** A class is not a function export. @intent make a thing */',
			'export class Thing {}',
			'',
			'/** A constant. @intent know the limit */',
			'export const LIMIT = 3',
			'',
			'/** A type. @intent describe a thing */',
			'export type ThingShape = { id: string }',
			'',
		].join('\n'),
	)
	write('src/second.ts', "export { shared } from './shared'\n")
	write('src/fn.ts', FN_SOURCE)
	write('src/shared.ts', SHARED_SOURCE)
	write(
		'src/more.ts',
		['/** More. @intent do more */', 'export function more(): void {}', ''].join('\n'),
	)
	write(
		'src/alias.ts',
		['/** Original. @intent be original */', 'export function original(): void {}', ''].join('\n'),
	)
	write(
		'src/re.ts',
		[
			"export { fn } from './fn'",
			"export * from './more'",
			"export { original as renamed } from './alias'",
			"export { shared } from './shared'",
			'',
		].join('\n'),
	)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function fixtureParams(): Parameters<typeof discoverExports>[0] {
	return {
		entries: [{ specifier: '@acme/pkg/sqlite', source: 'src/sqlite.ts' }],
		tsconfig: 'tsconfig.json',
		root,
	}
}

function byPath(methods: MethodEntry[]): Map<string, MethodEntry> {
	return new Map(methods.map((method) => [method.path, method]))
}

describe('discoverExports', { timeout: PROGRAM_TEST_TIMEOUT }, () => {
	it('an entry exporting functions, a class, a constant and a type → only the callable values, as <specifier>.<name>', () => {
		expect(
			discoverExports(fixtureParams())
				.map((method) => method.path)
				.sort(),
		).toEqual([
			'@acme/pkg/sqlite.connectHub',
			'@acme/pkg/sqlite.countRows',
			'@acme/pkg/sqlite.depFunction',
			'@acme/pkg/sqlite.plumbing',
			'@acme/pkg/sqlite.undocumented',
		])
	})

	it('a documented function → summary, intents, entry and declaredAt read', () => {
		expect(
			byPath(discoverExports(fixtureParams())).get('@acme/pkg/sqlite.connectHub'),
		).toMatchObject({
			summary: 'Connects to the hub of a project.',
			intents: ['open a connection to the hub', 'reach the shared engine'],
			entry: '@acme/pkg/sqlite',
			definedInPackage: true,
			internal: false,
			declaredAt: expect.stringMatching(/^src\/sqlite\.ts:\d+$/),
		})
	})

	it('a function with two parameters → the signature keeps every parameter', () => {
		expect(
			byPath(discoverExports(fixtureParams())).get('@acme/pkg/sqlite.connectHub')?.signature,
		).toBe('(params: { name: string; retries?: number; }, signal: AbortSignal) => string')
	})

	it('a documented arrow const → its JSDoc and both parameters', () => {
		expect(
			byPath(discoverExports(fixtureParams())).get('@acme/pkg/sqlite.countRows'),
		).toMatchObject({
			summary: 'Counts the rows.',
			intents: ['count rows'],
			signature: '(table: string, limit: number) => number',
			entry: '@acme/pkg/sqlite',
		})
	})

	it('an undocumented function → listed with no summary and no intent', () => {
		expect(
			byPath(discoverExports(fixtureParams())).get('@acme/pkg/sqlite.undocumented'),
		).toMatchObject({
			summary: undefined,
			intents: [],
			definedInPackage: true,
			entry: '@acme/pkg/sqlite',
		})
	})

	it('an @internal function → listed and flagged internal', () => {
		expect(
			byPath(discoverExports(fixtureParams())).get('@acme/pkg/sqlite.plumbing')?.internal,
		).toBe(true)
	})

	it('a function re-exported from a dependency → listed, not defined in the package', () => {
		expect(
			byPath(discoverExports(fixtureParams())).get('@acme/pkg/sqlite.depFunction'),
		).toMatchObject({
			definedInPackage: false,
			summary: 'Reads a thing from the dependency.',
		})
	})
})

describe('discoverExports, followed through re-exports', { timeout: PROGRAM_TEST_TIMEOUT }, () => {
	function reexportParams(): Parameters<typeof discoverExports>[0] {
		return {
			entries: [{ specifier: '@acme/pkg/re', source: 'src/re.ts' }],
			tsconfig: 'tsconfig.json',
			root,
		}
	}

	it('export { fn } from ./fn → declared at the function in src/fn.ts, with its JSDoc', () => {
		expect(byPath(discoverExports(reexportParams())).get('@acme/pkg/re.fn')).toMatchObject({
			declaredAt: `src/fn.ts:${FN_SOURCE.indexOf('export function fn')}`,
			summary: 'Reads fn.',
			intents: ['read fn'],
			entry: '@acme/pkg/re',
		})
	})

	it('export * from ./more → its functions listed', () => {
		expect(byPath(discoverExports(reexportParams())).get('@acme/pkg/re.more')).toMatchObject({
			summary: 'More.',
			declaredAt: expect.stringMatching(/^src\/more\.ts:\d+$/),
		})
	})

	it('export { original as renamed } → route <specifier>.renamed, the original name absent', () => {
		expect(
			discoverExports(reexportParams())
				.map((method) => method.path)
				.filter((path) => path.endsWith('.renamed') || path.endsWith('.original')),
		).toEqual(['@acme/pkg/re.renamed'])
	})

	it('a function exported by the entry and bound on q → the same declaredAt from discoverExports and discoverMethods', () => {
		const bound = discoverMethods({
			entrySource: [
				"import { shared } from '../../../src/shared'",
				'const q = { shared }',
				'export { q }',
				'',
			].join('\n'),
			tsconfig: 'tsconfig.json',
			root,
		}).find((method) => method.path === 'q.shared')

		expect(byPath(discoverExports(reexportParams())).get('@acme/pkg/re.shared')?.declaredAt).toBe(
			bound?.declaredAt,
		)
		expect(byPath(discoverExports(reexportParams())).get('@acme/pkg/re.shared')?.declaredAt).toBe(
			`src/shared.ts:${SHARED_SOURCE.indexOf('export function shared')}`,
		)
	})
})

describe('discoverExports, two entries', { timeout: PROGRAM_TEST_TIMEOUT }, () => {
	const ENTRIES = [
		{ specifier: '@acme/pkg/zeta', source: 'src/re.ts' },
		{ specifier: '@acme/pkg/alpha', source: 'src/second.ts' },
	]

	function twoEntryParams(): Parameters<typeof discoverExports>[0] {
		return { entries: ENTRIES, tsconfig: 'tsconfig.json', root }
	}
	function sharedDeclaredAt(): string {
		return `src/shared.ts:${SHARED_SOURCE.indexOf('export function shared')}`
	}

	it('entries in non-alphabetical order sharing one function → rows grouped in entries order', () => {
		expect(discoverExports(twoEntryParams()).map((method) => rank(method.entry))).toEqual(
			expect.arrayContaining([0, 1]),
		)
		expect(discoverExports(twoEntryParams()).map((method) => rank(method.entry))).toEqual(
			discoverExports(twoEntryParams())
				.map((method) => rank(method.entry))
				.sort((left, right) => left - right),
		)
	})

	it('the shared function → two rows, one per entry, with an equal declaredAt', () => {
		expect(
			discoverExports(twoEntryParams())
				.filter((method) => method.path.endsWith('.shared'))
				.map((method) => [method.path, method.declaredAt]),
		).toEqual([
			['@acme/pkg/zeta.shared', sharedDeclaredAt()],
			['@acme/pkg/alpha.shared', sharedDeclaredAt()],
		])
	})

	function rank(specifier: string | undefined): number {
		return ENTRIES.findIndex((entry) => entry.specifier === specifier)
	}
})
