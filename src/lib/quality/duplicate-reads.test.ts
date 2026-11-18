/** `findDuplicateReads`: an added function that re-reads what an existing one reads, or that already exists by its words. */
import { changeFactsOf, resolverOver } from '../../../test/quality-workspace.ts'
import { functionSidesOf } from './change-sides.ts'
import { findDuplicateReads } from './duplicate-reads.ts'

import { describe, expect, it } from 'vitest'

import type { DuplicateRead } from './quality.types.ts'

const NAMING_FILE = 'export const NAMING: readonly string[] = namesOfTheStandard()\n'

const READ_OWNER_FILE = [
	"import { NAMING } from './naming.constants.ts'",
	'',
	'/** Reads the owner of a widget. */',
	"export function readOwner(record: TrackedRecord<'Widget'>): string[] {",
	'\treturn NAMING.map((name) => readAttribute({ record, name }))',
	'}',
	'',
].join('\n')

const KEYS_OF_RECORD_FILE = [
	"import { NAMING } from '../read/naming.constants.ts'",
	'',
	'/** Lists the keys of a record. */',
	"export function keysOfRecord(record: TrackedRecord<'Widget'>): string[] {",
	'\treturn NAMING.flatMap((name) => [readAttribute({ record, name })])',
	'}',
	'',
].join('\n')

const PAIRED_KEYS_FILE = [
	"import { NAMING } from '../read/naming.constants.ts'",
	"import { readOwner } from '../read/owner.ts'",
	'',
	'/** Pairs each key of a record. */',
	"export function pairedKeys(record: TrackedRecord<'Widget'>): string[][] {",
	'\treturn NAMING.map((name) => [name, ...readOwner(record), readAttribute({ record, name })])',
	'}',
	'',
].join('\n')

const RESOLVE_WIDGET_FILE = [
	'/** Resolves a widget. */',
	'export function resolveWidget(name: string): string {',
	'\treturn name',
	'}',
	'',
].join('\n')

const RESOLVE_OWNER_FILE = [
	'/** Resolves the owner of a widget. */',
	'export function resolveWidgetOwner(name: string): string {',
	'\treturn name.trim()',
	'}',
	'',
].join('\n')

const RESOLVE_OWNER_CALLING_FILE = [
	"import { resolveWidget } from './resolve.ts'",
	'',
	'/** Resolves the owner of a widget. */',
	'export function resolveWidgetOwner(name: string): string {',
	'\treturn resolveWidget(name).trim()',
	'}',
	'',
].join('\n')

/** A function reading `names` of a `Gadget` by literal, summarized by `summary`. */
function gadgetReader(params: { name: string; summary: string; names: string[] }): string {
	return [
		`/** ${params.summary} */`,
		`export function ${params.name}(record: TrackedRecord<'Gadget'>): string[] {`,
		`\treturn [${params.names.map((name) => `readAttribute({ record, name: '${name}' })`).join(', ')}]`,
		'}',
		'',
	].join('\n')
}

const GADGET_READER_FILE = gadgetReader({
	name: 'gadgetLabel',
	summary: 'Builds the label of a gadget.',
	names: ['first', 'second', 'third'],
})

const READ_BASE = {
	'src/read/naming.constants.ts': NAMING_FILE,
	'src/read/owner.ts': READ_OWNER_FILE,
}

describe('findDuplicateReads', () => {
	const testCases: Record<
		string,
		{ base: Record<string, string>; tree: Record<string, string>; expected: DuplicateRead[] }
	> = {
		'an added function reading the element through the named set an existing one reads, a third reading the same but calling the existing one → one reads finding, on the first':
			{
				base: READ_BASE,
				tree: {
					...READ_BASE,
					'src/use/keys.ts': KEYS_OF_RECORD_FILE,
					'src/use/paired.ts': PAIRED_KEYS_FILE,
				},
				expected: [
					{
						file: 'src/use/keys.ts',
						line: 4,
						name: 'keysOfRecord',
						signal: 'reads',
						existing: { file: 'src/read/owner.ts', line: 4, name: 'readOwner' },
						element: 'Widget',
						attributes: ['@NAMING'],
					},
				],
			},
		'an added function whose name and summary say what an existing one does, not calling it → one find finding':
			{
				base: { 'src/find/resolve.ts': RESOLVE_WIDGET_FILE },
				tree: {
					'src/find/resolve.ts': RESOLVE_WIDGET_FILE,
					'src/find/owner.ts': RESOLVE_OWNER_FILE,
				},
				expected: [
					{
						file: 'src/find/owner.ts',
						line: 2,
						name: 'resolveWidgetOwner',
						signal: 'find',
						existing: { file: 'src/find/resolve.ts', line: 2, name: 'resolveWidget' },
					},
				],
			},
		'the same added function calling the existing one → none': {
			base: { 'src/find/resolve.ts': RESOLVE_WIDGET_FILE },
			tree: {
				'src/find/resolve.ts': RESOLVE_WIDGET_FILE,
				'src/find/owner.ts': RESOLVE_OWNER_CALLING_FILE,
			},
			expected: [],
		},
		'two added sibling functions with the same words, nothing like them existing → none': {
			base: { 'src/find/resolve.ts': RESOLVE_WIDGET_FILE },
			tree: {
				'src/find/resolve.ts': RESOLVE_WIDGET_FILE,
				'src/gadget/name.ts': gadgetReader({
					name: 'gadgetName',
					summary: 'Gives the name of a gadget.',
					names: [],
				}),
				'src/gadget/title.ts': gadgetReader({
					name: 'gadgetTitle',
					summary: 'Gives the title of a gadget.',
					names: [],
				}),
			},
			expected: [],
		},
		'an added function sharing two attributes of the element with an existing one → none': {
			base: { 'src/gadget/label.ts': GADGET_READER_FILE },
			tree: {
				'src/gadget/label.ts': GADGET_READER_FILE,
				'src/report/pair.ts': gadgetReader({
					name: 'pairOf',
					summary: 'Pairs two values.',
					names: ['first', 'second'],
				}),
			},
			expected: [],
		},
		'an added function sharing three attributes of the element with an existing one → one reads finding':
			{
				base: { 'src/gadget/label.ts': GADGET_READER_FILE },
				tree: {
					'src/gadget/label.ts': GADGET_READER_FILE,
					'src/report/triple.ts': gadgetReader({
						name: 'tripleOf',
						summary: 'Groups three values.',
						names: ['first', 'second', 'third'],
					}),
				},
				expected: [
					{
						file: 'src/report/triple.ts',
						line: 2,
						name: 'tripleOf',
						signal: 'reads',
						existing: { file: 'src/gadget/label.ts', line: 2, name: 'gadgetLabel' },
						element: 'Gadget',
						attributes: ['first', 'second', 'third'],
					},
				],
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const change = changeFactsOf(testCase)
			const resolve = resolverOver(Object.keys(testCase.tree))

			expect(findDuplicateReads({ sides: functionSidesOf(change), indexes: [], resolve })).toEqual(
				testCase.expected,
			)
		})
})
