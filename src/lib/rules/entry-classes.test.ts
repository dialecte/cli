import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { readEntryClasses } from './entry-classes.ts'
import { createImportReading } from './import-reading.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	/** The package's files besides its package.json, whose `exports` names `./dist/index.d.ts` (`src/index.ts`). */
	files: Record<string, string>
	/** By file, the classes the entry exports, sorted. */
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

const PROJECT = moduleOf(['export class Project {}', 'class Hidden {}'])

function entryClassesOf(files: Record<string, string>): Record<string, string[]> {
	const root = temporaryFolder('entry-classes-')
	writeFiles({ root, files: { 'package.json': PACKAGE_JSON, ...files } })
	const classes = readEntryClasses({ root, reading: createImportReading({ root }) })
	return Object.fromEntries(
		[...classes].map(([file, names]): [string, string[]] => [file, [...names].sort()]),
	)
}

describe('readEntryClasses', () => {
	const testCases: Record<string, TestCase> = {
		'a class the entry declares and exports → admitted; one it does not export → not': {
			files: { 'src/index.ts': PROJECT },
			expected: { 'src/index.ts': ['Project'] },
		},
		'export * of a module, through a folder index → its exported classes': {
			files: {
				'src/index.ts': "export * from './project'\n",
				'src/project/index.ts': "export * from './project'\n",
				'src/project/project.ts': PROJECT,
			},
			expected: { 'src/project/project.ts': ['Project'] },
		},
		'export { a as b } from, a type-only export, export * as → the named classes only': {
			files: {
				'src/index.ts': moduleOf([
					"export { Project as Workspace } from './project'",
					"export type { Query } from './query'",
					"export * as stores from './stores'",
				]),
				'src/project.ts': moduleOf(['export class Project {}', 'export class Other {}']),
				'src/query.ts': 'export class Query {}\n',
				'src/stores.ts': 'export class MemoryStore {}\n',
			},
			expected: {
				'src/project.ts': ['Project'],
				'src/query.ts': ['Query'],
				'src/stores.ts': ['MemoryStore'],
			},
		},
		'an imported class exported again, a default import, a const class → each followed to its module':
			{
				files: {
					'src/index.ts': moduleOf([
						"import { Project as Held } from './project'",
						"import Document from './document'",
						'export { Held as Project, Document }',
						"export { Transaction } from './transaction'",
					]),
					'src/project.ts': PROJECT,
					'src/document.ts': 'export default class Document {}\n',
					'src/transaction.ts': moduleOf([
						'const Transaction = class {}',
						'export { Transaction }',
					]),
				},
				expected: {
					'src/project.ts': ['Project'],
					'src/document.ts': ['Document'],
					'src/transaction.ts': ['Transaction'],
				},
			},
		'export * of a module with a default-exported class → not that class: export * never re-exports a default':
			{
				files: {
					'src/index.ts': "export * from './star'\n",
					'src/star.ts': moduleOf(['export default class Hidden {}', 'export class Shown {}']),
				},
				expected: { 'src/star.ts': ['Shown'] },
			},
		'export default of a class name, export { Local } of a class declared without export → each admitted':
			{
				files: {
					'src/index.ts': moduleOf([
						"export { default as Project } from './project'",
						"export { Local } from './local'",
					]),
					'src/project.ts': moduleOf(['class Project {}', 'export default Project']),
					'src/local.ts': moduleOf(['class Local {}', 'export { Local }']),
				},
				expected: { 'src/project.ts': ['Project'], 'src/local.ts': ['Local'] },
			},
		'a module of another package, a module no entry reaches → no class': {
			files: {
				'src/index.ts': "export { Project } from '@demo/other'\n",
				'src/unreached.ts': 'export class Unreached {}\n',
			},
			expected: {},
		},
		'two modules exporting each other → each read once, the walk ends': {
			files: {
				'src/index.ts': "export * from './a'\n",
				'src/a.ts': moduleOf(["export * from './b'", 'export class A {}']),
				'src/b.ts': moduleOf(["export * from './a'", 'export class B {}']),
			},
			expected: { 'src/a.ts': ['A'], 'src/b.ts': ['B'] },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(entryClassesOf(testCase.files)).toEqual(testCase.expected)
		})

	it('a package without an exports map → no class', () => {
		const root = temporaryFolder('entry-classes-')
		writeFiles({
			root,
			files: { 'package.json': '{ "name": "demo" }\n', 'src/index.ts': PROJECT },
		})

		expect(readEntryClasses({ root, reading: createImportReading({ root }) }).size).toBe(0)
	})
})
