import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { readEntryClasses } from './entry-classes.ts'
import { createImportReading } from './import-reading.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	files: Record<string, string>
	expected: Record<string, string[]>
	only?: boolean
}

const PACKAGE_JSON = `${JSON.stringify({
	name: '@demo/facade',
	exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
})}\n`

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

function entryClassesOf(files: Record<string, string>): Record<string, string[]> {
	const root = temporaryFolder('entry-classes-')
	writeFiles({ root, files: { 'package.json': PACKAGE_JSON, ...files } })
	return Object.fromEntries(
		[...readEntryClasses({ root, reading: createImportReading({ root }) })].map(
			([file, names]): [string, string[]] => [file, [...names].sort()],
		),
	)
}

describe('readEntryClasses: a const or a type naming a class', () => {
	const testCases: Record<string, TestCase> = {
		'export const Store = MemoryStore, the class imported → followed to it': {
			files: {
				'src/index.ts': moduleOf([
					"import { MemoryStore } from './memory-store'",
					'export const Store = MemoryStore',
				]),
				'src/memory-store.ts': 'export class MemoryStore {}\n',
			},
			expected: { 'src/memory-store.ts': ['MemoryStore'] },
		},
		'export type Facade = Impl, and a type exported by an export list → each followed to its class':
			{
				files: {
					'src/index.ts': moduleOf([
						"import type { Impl } from './impl'",
						'export type Facade = Impl<string>',
						'class Local {}',
						'type Held = Local',
						'export type { Held }',
					]),
					'src/impl.ts': 'export class Impl<GenericValue> {}\n',
				},
				expected: { 'src/impl.ts': ['Impl'], 'src/index.ts': ['Local'] },
			},
		'two consts naming each other → the walk ends, nothing admitted': {
			files: {
				'src/index.ts': moduleOf(['export const First = Second', 'const Second = First']),
			},
			expected: {},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(entryClassesOf(testCase.files)).toEqual(testCase.expected)
		})
})
