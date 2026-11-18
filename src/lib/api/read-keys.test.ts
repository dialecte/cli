/** `parseSourceFile`'s facts: what each top-level function reads, calls and declares, free of the file's path. */
import { parseSourceFile } from './source-file-functions.ts'

import { describe, expect, it } from 'vitest'

import type { FileFacts, FunctionFacts } from './source-functions.types.ts'

/** The facts of `text` parsed as `file`; none when the parser gives none. */
function factsOf(params: { text: string; file?: string }): FileFacts | undefined {
	return parseSourceFile({ file: params.file ?? 'src/a.ts', text: params.text }).facts
}

/** The function named `name` of `facts`; undefined when it holds none. */
function functionOf(params: {
	facts: FileFacts | undefined
	name: string
}): FunctionFacts | undefined {
	return params.facts?.functions.find((candidate) => candidate.name === params.name)
}

describe('parseSourceFile: the read keys of a function', () => {
	const testCases: Record<
		string,
		{ text: string; name: string; expected: FunctionFacts['readKeys'] }
	> = {
		'an element as a type argument, attributes read through an imported constant of names → the element and the named set':
			{
				text: [
					"import { NAMING } from './naming.constants.ts'",
					'',
					"export function ownerOf(record: TrackedRecord<'Widget'>): string[] {",
					'\treturn NAMING.map((name) => readAttribute({ record, name }))',
					'}',
					'',
				].join('\n'),
				name: 'ownerOf',
				expected: { elements: ['Widget'], attributes: [], namedSets: ['NAMING'] },
			},
		"a constant of the file listing string literals, read through → its names are the function's attributes":
			{
				text: [
					"const KEYS = ['first', 'second', 'third'] as const",
					'',
					"export function keysOf(record: TrackedRecord<'Widget'>): string[] {",
					'\treturn KEYS.map((name) => readAttribute({ record, name }))',
					'}',
					'',
				].join('\n'),
				name: 'keysOf',
				expected: { elements: ['Widget'], attributes: ['first', 'second', 'third'], namedSets: [] },
			},
		'attributes by name, as a direct argument, by property, by destructuring and by a literal index → each once, sorted':
			{
				text: [
					'export function pathOf(params: { record: Tracked; attributes: WidgetAttributes }): string {',
					"\tconst owner = readAttribute({ record: params.record, name: 'owner' })",
					"\tconst prefix = getAttribute(params.record, 'prefix')",
					'\tconst { attributes } = params',
					'\tconst { kind } = attributes',
					"\treturn [owner, prefix, attributes.size, kind, attributes['slot']].join('/')",
					'}',
					'',
				].join('\n'),
				name: 'pathOf',
				expected: {
					elements: [],
					attributes: ['kind', 'owner', 'prefix', 'size', 'slot'],
					namedSets: [],
				},
			},
		'a tag compared with a literal and a tag passed as an option → both elements': {
			text: [
				'export async function partsOf(params: { query: Query; record: Tracked }): Promise<unknown[]> {',
				"\tif (params.record.tagName === 'Gadget') return []",
				"\treturn params.query.getRecords({ tag: 'Part' })",
				'}',
				'',
			].join('\n'),
			name: 'partsOf',
			expected: { elements: ['Gadget', 'Part'], attributes: [], namedSets: [] },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const facts = factsOf({ text: testCase.text })

			expect(functionOf({ facts, name: testCase.name })?.readKeys).toEqual(testCase.expected)
		})
})

describe('parseSourceFile: calls, imports, exports and hashes', () => {
	it('a function calling an imported function and a local one → both calls, the imported one with its specifier; the imports and re-exports listed', () => {
		const text = [
			"import { helper } from './helper.ts'",
			"import * as tools from './tools.ts'",
			"export { thing } from './thing.ts'",
			"export * from './all.ts'",
			'',
			'function local(): number {',
			'\treturn 1',
			'}',
			'',
			'export function main(): number {',
			'\thelper()',
			'\treturn local() + tools.count()',
			'}',
			'',
		].join('\n')

		const facts = factsOf({ text })

		expect({
			calls: functionOf({ facts, name: 'main' })?.calls,
			imports: facts?.imports,
			exported: facts?.functions.map((found) => ({
				name: found.name,
				line: found.line,
				exportedAs: found.exportedAs,
			})),
		}).toEqual({
			calls: [{ name: 'helper', specifier: './helper.ts' }, { name: 'local' }],
			imports: [
				{
					specifier: './helper.ts',
					names: [{ imported: 'helper', local: 'helper' }],
					reexport: false,
				},
				{
					specifier: './tools.ts',
					names: [{ imported: '*', local: 'tools' }],
					reexport: false,
					all: true,
				},
				{ specifier: './thing.ts', names: [{ imported: 'thing', local: 'thing' }], reexport: true },
				{ specifier: './all.ts', names: [], reexport: true, all: true },
			],
			exported: [
				{ name: 'local', line: 6, exportedAs: [] },
				{ name: 'main', line: 10, exportedAs: ['main'] },
			],
		})
	})

	it('the same function reformatted and commented → the same signature and body hashes; a changed body → another body hash, the same signature hash', () => {
		const original = 'export function size(items: string[]): number {\n\treturn items.length\n}\n'
		const reformatted =
			'export function size(\n\titems: string[], // the items\n): number {\n\t/* how many */ return items.length;\n}\n'
		const changed =
			'export function size(items: string[]): number {\n\treturn items.length + 1\n}\n'

		const [first, second, third] = [original, reformatted, changed].map((text) =>
			functionOf({ facts: factsOf({ text }), name: 'size' }),
		)

		expect({
			sameSignature: first?.signatureHash === second?.signatureHash,
			sameBody: first?.bodyHash === second?.bodyHash,
			changedBody: first?.bodyHash !== third?.bodyHash,
			changedSignature: first?.signatureHash !== third?.signatureHash,
			counted: (first?.bodyTokenCount ?? 0) > 0,
		}).toEqual({
			sameSignature: true,
			sameBody: true,
			changedBody: true,
			changedSignature: false,
			counted: true,
		})
	})

	it('a types file → each type alias and interface with a hash that ignores formatting', () => {
		const text =
			'export type Params = { root: string }\n\nexport interface Shape {\n\tsize: number\n}\n'
		const reformatted =
			'export type Params = {\n\troot: string\n}\nexport interface Shape { size: number }\n'

		const first = factsOf({ text, file: 'src/a.types.ts' })?.types ?? []
		const second = factsOf({ text: reformatted, file: 'src/a.types.ts' })?.types ?? []

		expect({
			names: first.map((declared) => declared.name),
			same: first.map((declared) => declared.hash),
		}).toEqual({
			names: ['Params', 'Shape'],
			same: second.map((declared) => declared.hash),
		})
	})
})
