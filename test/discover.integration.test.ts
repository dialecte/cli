import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverMethods } from '../src/lib/discover.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MethodEntry } from '../src/lib/discover.types.ts'

let root: string

function write(path: string, content: string): void {
	mkdirSync(join(root, path, '..'), { recursive: true })
	writeFileSync(join(root, path), content)
}

/**
 * A package shaped like a dialecte: an engine class in a dependency (node_modules/engine), extensions
 * bound onto the query through a mapped type that drops the first argument, as core binds them.
 */
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-discover-'))
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
	write('node_modules/engine/package.json', JSON.stringify({ name: 'engine', types: 'index.d.ts' }))
	write(
		'node_modules/engine/index.d.ts',
		[
			'export declare class Query {',
			'  /** Reads one record. @intent read a record */',
			'  getRecord(id: string): Promise<string>',
			'  /** Engine plumbing. @internal */',
			'  finishStaging(): void',
			'  private secret(): void',
			'}',
			'// the binding chain of @dialecte/core: modules merged with remapped keys, then bound group by group',
			'type AnyFn = (...args: any[]) => any',
			'type Group = { [key: string]: AnyFn | Group }',
			'type OmitFirstArg<F extends AnyFn> = F extends (first: any, ...rest: infer A) => infer R ? (...args: A) => R : never',
			'type BoundGroup<G> = { [Key in keyof G]: G[Key] extends AnyFn ? OmitFirstArg<G[Key]> : G[Key] extends Group ? BoundGroup<G[Key]> : never }',
			'type BoundExtensionMap<M> = { [Name in keyof M]: BoundGroup<M[Name]> }',
			"type Merged<Modules extends Record<string, { query?: Group }>> = { query: { [K in keyof Modules as Modules[K]['query'] extends Group ? K : never]: Modules[K]['query'] extends Group ? Modules[K]['query'] : never } }",
			"export type QueryExtensions<Modules extends Record<string, { query?: Group }>> = BoundExtensionMap<Merged<Modules>['query']>",
			'export declare class Box<Config extends string> {',
			'  /** Reads one tag. @intent read a tag */',
			'  read<Tag extends Config>(tag: Tag): Tag',
			'}',
			'',
		].join('\n'),
	)
	write(
		'src/labels/title-of.ts',
		[
			"import type { Query } from 'engine'",
			'/**',
			' * The title of an element, for a tree.',
			' *',
			' * @intent label of an element, title (short, long) for a tree',
			' */',
			'export function titleOf(query: Query, params: { id: string }): string { return params.id }',
			'',
		].join('\n'),
	)
	write(
		'src/labels/undocumented.ts',
		[
			"import type { Query } from 'engine'",
			'export function undocumented(query: Query): void {}',
			'',
		].join('\n'),
	)
	// verbs declared as arrow functions, one documented and one not
	write(
		'src/labels/arrows.ts',
		[
			"import type { Query } from 'engine'",
			'/** Counts the labels. @intent count labels */',
			'export const countOf = (query: Query): number => 0',
			'export const silent = (query: Query): void => {}',
			'',
		].join('\n'),
	)
	// a verb whose JSDoc links to another verb, in each form
	write(
		'src/labels/linked.ts',
		[
			"import type { Query } from 'engine'",
			"import { titleOf } from './title-of'",
			'/**',
			' * Reads {@link titleOf | the title}, then {@link titleOf} and {@linkcode titleOf}.',
			' *',
			' * @intent walk {@link titleOf | a title}, use {@link titleOf}, call {@linkcode titleOf}',
			' */',
			'export function linked(query: Query): void {}',
			'',
		].join('\n'),
	)
	// a verb whose JSDoc carries an example in a code fence
	write(
		'src/labels/sample.ts',
		[
			"import type { Query } from 'engine'",
			'/**',
			' * A sample.',
			' *',
			' * @intent sample',
			' * @example',
			' * ```ts',
			' * const title = await doc.query.labels.sample()',
			' * ```',
			' * The title is the element name when it has no label.',
			' */',
			'export function sample(',
			'	query: Query,',
			'	ref: string,',
			'	options?: {',
			'		/** The long form. */',
			'		long: boolean',
			'		depth?: number // how deep',
			'	},',
			'): void {}',
			'',
		].join('\n'),
	)
	// a barrel re-exporting each verb, as the extensions of a dialecte do
	write(
		'src/labels/query.ts',
		[
			"export { titleOf } from './title-of'",
			"export { undocumented } from './undocumented'",
			"export { countOf, silent } from './arrows'",
			"export { linked } from './linked'",
			"export { sample } from './sample'",
			'',
		].join('\n'),
	)
	write(
		'src/labels/index.ts',
		[
			"import * as labelQueries from './query'",
			"import * as arrows from './arrows'",
			"import { titleOf } from './title-of'",
			"import { countOf, silent } from './arrows'",
			'export const labels = { query: labelQueries }',
			'export const shorthand = { query: { titleOf, countOf, silent } }',
			'export const accessed = { query: { count: arrows.countOf, quiet: arrows.silent } }',
			'',
		].join('\n'),
	)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function discoverFixture(): Map<string, MethodEntry> {
	const methods = discoverMethods({
		entrySource: [
			"import type { Query, QueryExtensions } from 'engine'",
			"import type { labels, shorthand, accessed } from '../../../src/labels'",
			'declare const q: Query & QueryExtensions<{ labels: typeof labels; shorthand: typeof shorthand; accessed: typeof accessed }>',
			'export { q }',
			'',
		].join('\n'),
		tsconfig: 'tsconfig.json',
		root,
		maxDepth: 2,
	})
	return new Map<string, MethodEntry>(methods.map((method) => [method.path, method]))
}

describe('discoverMethods (integration)', () => {
	it('an @example in a code fence followed by prose → the code only, without the fence', () => {
		expect(discoverFixture().get('q.labels.sample')?.example).toBe(
			'const title = await doc.query.labels.sample()',
		)
	})

	it('a method of a class instantiated with tag names → its signature as declared, generic', () => {
		const [method] = discoverMethods({
			entrySource: [
				"import type { Box } from 'engine'",
				"declare const q: Box<'A' | 'B'>",
				'export { q }',
				'',
			].join('\n'),
			tsconfig: 'tsconfig.json',
			root,
		})
		expect(method.signature).toBe('<Tag extends Config>(tag: Tag) => Tag')
	})

	it('a bound verb of several parameters, one a multi-line object with comments → every parameter but the query, members separated, no comment', () => {
		expect(discoverFixture().get('q.labels.sample')?.signature).toBe(
			'(ref: string, options?: { long: boolean; depth?: number; }) => void',
		)
	})

	it('a bound verb → its signature as a caller writes it, the query parameter dropped', () => {
		expect(discoverFixture().get('q.labels.titleOf')?.signature).toBe(
			'(params: { id: string; }) => string',
		)
	})

	it('JSDoc links in a summary and an @intent → a label as text, a bare name or linkcode as code', () => {
		expect(discoverFixture().get('q.labels.linked')).toMatchObject({
			summary: 'Reads the title, then `titleOf` and `titleOf`.',
			intents: ['walk a title', 'use `titleOf`', 'call `titleOf`'],
		})
	})

	it('documented arrow verb by namespace import, shorthand and property access → its JSDoc, one declaration', () => {
		const byPath = discoverFixture()
		for (const path of ['q.labels.countOf', 'q.shorthand.countOf', 'q.accessed.count'])
			expect(byPath.get(path), path).toMatchObject({
				summary: 'Counts the labels.',
				intents: ['count labels'],
				declaredAt: expect.stringMatching(/^src\/labels\/arrows\.ts:\d+$/),
			})
		expect(byPath.get('q.shorthand.countOf')?.declaredAt).toBe(
			byPath.get('q.labels.countOf')?.declaredAt,
		)
		expect(byPath.get('q.accessed.count')?.declaredAt).toBe(
			byPath.get('q.labels.countOf')?.declaredAt,
		)
	})

	it('undocumented arrow verb by namespace import, shorthand and property access → one declaration, at the arrow', () => {
		const byPath = discoverFixture()
		for (const path of ['q.labels.silent', 'q.shorthand.silent', 'q.accessed.quiet'])
			expect(byPath.get(path), path).toMatchObject({
				summary: undefined,
				definedInPackage: true,
				declaredAt: expect.stringMatching(/^src\/labels\/arrows\.ts:\d+$/),
			})
		expect(byPath.get('q.shorthand.silent')?.declaredAt).toBe(
			byPath.get('q.labels.silent')?.declaredAt,
		)
		expect(byPath.get('q.accessed.quiet')?.declaredAt).toBe(
			byPath.get('q.labels.silent')?.declaredAt,
		)
	})

	it('JSDoc found through the namespace import, the shorthand and the binding; dependency and internal marked', () => {
		const methods = discoverMethods({
			entrySource: [
				"import type { Query, QueryExtensions } from 'engine'",
				"import type { labels, shorthand } from '../../../src/labels'",
				'declare const q: Query & QueryExtensions<{ labels: typeof labels; shorthand: typeof shorthand }>',
				'export { q }',
				'',
			].join('\n'),
			tsconfig: 'tsconfig.json',
			root,
			maxDepth: 2,
		})
		const byPath = new Map<string, MethodEntry>(methods.map((method) => [method.path, method]))

		expect(byPath.get('q.labels.titleOf')).toMatchObject({
			path: 'q.labels.titleOf',
			summary: 'The title of an element, for a tree.',
			intents: ['label of an element', 'title (short, long) for a tree'],
			definedInPackage: true,
			internal: false,
		})
		expect(byPath.get('q.shorthand.titleOf')?.summary).toBe('The title of an element, for a tree.')
		// two routes to one function: one declaration, so one row in the index
		expect(byPath.get('q.labels.titleOf')?.declaredAt).toMatch(/^src\/labels\/title-of\.ts:\d+$/)
		expect(byPath.get('q.shorthand.titleOf')?.declaredAt).toBe(
			byPath.get('q.labels.titleOf')?.declaredAt,
		)
		expect(byPath.get('q.labels.undocumented')).toMatchObject({
			summary: undefined,
			definedInPackage: true,
		})
		expect(byPath.get('q.getRecord')).toMatchObject({
			summary: 'Reads one record.',
			intents: ['read a record'],
			definedInPackage: false,
		})
		expect(byPath.get('q.finishStaging')?.internal).toBe(true)
		expect(byPath.has('q.secret')).toBe(false)
	})
})
