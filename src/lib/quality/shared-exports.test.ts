/** `findSharedExportChanges`: the exports other folders import that the change shares, re-signs, rewrites or removes. */
import { changeFactsOf, resolverOver } from '../../../test/quality-workspace.ts'
import { findSharedExportChanges } from './shared-exports.ts'

import { describe, expect, it } from 'vitest'

import type { SharedExportChange } from './quality.types.ts'

const SIZE = [
	'export function sizeOf(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')

const SIZE_RESIGNED = [
	'export function sizeOf(items: readonly string[], empty = false): number {',
	"\treturn empty ? items.length : items.filter((item) => item !== '').length",
	'}',
	'',
].join('\n')

const SIZE_REFORMATTED = [
	'export function sizeOf(',
	'\titems: readonly string[], // the items',
	'): number {',
	'\treturn items.length;',
	'}',
	'',
].join('\n')

const COUNT_RENAMED = [
	'export function countOf(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')

/** A file of `folder` importing `name` through `specifier`, and calling it. */
function userOf(params: { specifier: string; name?: string }): string {
	const name = params.name ?? 'sizeOf'
	return [
		`import { ${name} } from '${params.specifier}'`,
		'',
		`export function total(items: readonly string[]): number {`,
		`\treturn ${name}(items) + 1`,
		'}',
		'',
	].join('\n')
}

const FRAME = [
	'function makeFrame(name: string): string {',
	'\treturn `[${name}]`',
	'}',
	'',
	'export function frames(names: readonly string[]): string[] {',
	'\treturn names.map(makeFrame)',
	'}',
	'',
].join('\n')

const FRAME_EXPORTED = FRAME.replace('function makeFrame', 'export function makeFrame')

const SIZE_TYPES = 'export type SizeParams = { items: readonly string[] }\n'
const SIZE_TYPES_CHANGED =
	'export type SizeParams = { items: readonly string[]; empty?: boolean }\n'
const SIZE_WITH_TYPE = [
	"import type { SizeParams } from './size.types.ts'",
	'',
	'export function sizeOf(params: SizeParams): number {',
	'\treturn params.items.length',
	'}',
	'',
].join('\n')

/** One finding of `sizeOf` in `src/core/size.ts`, imported from `src/use`, with `changes`. */
function sizeFinding(
	params: Partial<SharedExportChange> & Pick<SharedExportChange, 'changes'>,
): SharedExportChange {
	return {
		file: 'src/core/size.ts',
		line: 1,
		name: 'sizeOf',
		folder: 'src/core',
		importers: ['src/use'],
		...params,
	}
}

describe('findSharedExportChanges', () => {
	const testCases: Record<
		string,
		{
			base: Record<string, string>
			tree: Record<string, string>
			renamed?: Record<string, string>
			expected: SharedExportChange[]
		}
	> = {
		'an exported function gaining an optional parameter and a changed body, imported from another folder → signature and behaviour':
			{
				base: {
					'src/core/size.ts': SIZE,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
				},
				tree: {
					'src/core/size.ts': SIZE_RESIGNED,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
				},
				expected: [sizeFinding({ changes: ['signature', 'behaviour'] })],
			},
		'a private function exported and imported by a file of a sibling folder → newly-shared': {
			base: { 'src/topology/frame.ts': FRAME },
			tree: {
				'src/topology/frame.ts': FRAME_EXPORTED,
				'src/ied/clone.ts': userOf({ specifier: '../topology/frame.ts', name: 'makeFrame' }),
			},
			expected: [
				{
					file: 'src/topology/frame.ts',
					line: 1,
					name: 'makeFrame',
					folder: 'src/topology',
					importers: ['src/ied'],
					changes: ['newly-shared'],
				},
			],
		},
		'the same function imported only by a file of its own folder → none': {
			base: { 'src/topology/frame.ts': FRAME },
			tree: {
				'src/topology/frame.ts': FRAME_EXPORTED,
				'src/topology/use.ts': userOf({ specifier: './frame.ts', name: 'makeFrame' }),
			},
			expected: [],
		},
		'the same function imported by a file of a sub-folder of its folder → newly-shared': {
			base: { 'src/topology/frame.ts': FRAME },
			tree: {
				'src/topology/frame.ts': FRAME_EXPORTED,
				'src/topology/sub/use.ts': userOf({ specifier: '../frame.ts', name: 'makeFrame' }),
			},
			expected: [
				{
					file: 'src/topology/frame.ts',
					line: 1,
					name: 'makeFrame',
					folder: 'src/topology',
					importers: ['src/topology/sub'],
					changes: ['newly-shared'],
				},
			],
		},
		'a shared export reformatted only → none': {
			base: {
				'src/core/size.ts': SIZE,
				'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
			},
			tree: {
				'src/core/size.ts': SIZE_REFORMATTED,
				'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
			},
			expected: [],
		},
		"only the sibling types file changes a type a shared export's parameter names → signature, on the export's line":
			{
				base: {
					'src/core/size.types.ts': SIZE_TYPES,
					'src/core/size.ts': SIZE_WITH_TYPE,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
				},
				tree: {
					'src/core/size.types.ts': SIZE_TYPES_CHANGED,
					'src/core/size.ts': SIZE_WITH_TYPE,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
				},
				expected: [sizeFinding({ line: 3, changes: ['signature'] })],
			},
		"a folder's index changed, imported as the folder from another folder → its change reported": {
			base: { 'src/core/index.ts': SIZE, 'src/use/user.ts': userOf({ specifier: '../core' }) },
			tree: {
				'src/core/index.ts': SIZE_RESIGNED,
				'src/use/user.ts': userOf({ specifier: '../core' }),
			},
			expected: [sizeFinding({ file: 'src/core/index.ts', changes: ['signature', 'behaviour'] })],
		},
		'an export re-exported by a barrel of its folder and imported through it from another folder → shared':
			{
				base: {
					'src/core/size.ts': SIZE,
					'src/core/index.ts': "export { sizeOf } from './size.ts'\n",
					'src/use/user.ts': userOf({ specifier: '../core/index.ts' }),
				},
				tree: {
					'src/core/size.ts': SIZE_RESIGNED,
					'src/core/index.ts': "export { sizeOf } from './size.ts'\n",
					'src/use/user.ts': userOf({ specifier: '../core/index.ts' }),
				},
				expected: [sizeFinding({ changes: ['signature', 'behaviour'] })],
			},
		'a shared export renamed, its importer following it → the new name newly-shared, the old one removed on the exporter':
			{
				base: {
					'src/core/size.ts': SIZE,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
				},
				tree: {
					'src/core/size.ts': COUNT_RENAMED,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts', name: 'countOf' }),
				},
				expected: [
					sizeFinding({ name: 'countOf', changes: ['newly-shared'] }),
					sizeFinding({ changes: ['removed'] }),
				],
			},
		'a shared export removed while an unchanged importer still imports it → removed, on that import line':
			{
				base: {
					'src/core/size.ts': `${SIZE}\n${COUNT_RENAMED}`,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
				},
				tree: {
					'src/core/size.ts': COUNT_RENAMED,
					'src/use/user.ts': userOf({ specifier: '../core/size.ts' }),
				},
				expected: [sizeFinding({ file: 'src/use/user.ts', line: 1, changes: ['removed'] })],
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const change = changeFactsOf(testCase)
			const resolveTree = resolverOver(Object.keys(testCase.tree))
			const resolveBase = resolverOver(Object.keys(testCase.base))

			expect(findSharedExportChanges({ change, resolveTree, resolveBase })).toEqual(
				testCase.expected,
			)
		})
})
