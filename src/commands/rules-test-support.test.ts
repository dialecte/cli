import { lineOf, moduleOf, runJson, twiceTestOf } from '../../test/rules-import-run.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

const TEST_FILE = 'src/widget/add-widget.test.ts'

const ADD_WIDGET = moduleOf([
	'export function addWidget(params: { id: number }): number {',
	'\treturn params.id',
	'}',
])

describe(
	'dialecte rules: a helper that value-imports test support',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const SUPPORT_PACKAGE = {
			'package.json': `${JSON.stringify({
				name: '@dialecte/demo',
				dialecte: { tdd: { production: ['src/test'] } },
			})}\n`,
			'src/v1/generated/definition.generated.ts': 'export {}\n',
		}
		const HELPER_FILE = 'src/widget/integration/integration-helpers.ts'
		const SUPPORT_IMPORT = "import { findInTree } from '../../test/tree-entries.ts'"
		const TREE_ENTRIES = moduleOf([
			'export function findInTree(params: { id: number }): number {',
			'\treturn params.id',
			'}',
		])
		const TYPE_ONLY_ENTRIES = moduleOf(['export type TreeEntry = { id: number }'])
		const FIND_BY_NAME = [
			'export function findByName(params: { id: number }): number {',
			'\treturn findInTree(params)',
			'}',
		]
		const HELPER_IMPORTS_TEST_FOLDER = moduleOf([SUPPORT_IMPORT, ...FIND_BY_NAME])

		type SupportCase = {
			files: Record<string, string>
			imports: string[]
			name: string
			expectedCalls: string[]
			absolute?: boolean
		}
		const HELPER_IMPORT = "import { findByName } from './integration/integration-helpers.ts'"

		const testCases: Record<string, SupportCase> = {
			'a helper value-importing a file of the production folder, called twice → none': {
				files: {
					[HELPER_FILE]: HELPER_IMPORTS_TEST_FOLDER,
					'src/test/tree-entries.ts': TREE_ENTRIES,
				},
				imports: [HELPER_IMPORT],
				name: 'findByName',
				expectedCalls: [],
			},
			'a helper value-importing a file that imports vitest, called twice → none': {
				files: {
					[HELPER_FILE]: moduleOf([
						"import { findInTree } from './vitest-entries.ts'",
						...FIND_BY_NAME,
					]),
					'src/widget/integration/vitest-entries.ts': moduleOf([
						"import { vi } from 'vitest'",
						'export function findInTree(params: { id: number }): number {',
						'\tvi.fn()',
						'\treturn params.id',
						'}',
					]),
				},
				imports: [HELPER_IMPORT],
				name: 'findByName',
				expectedCalls: [],
			},
			'a helper importing only a type from the production folder, called twice → one finding': {
				files: {
					[HELPER_FILE]: moduleOf([
						"import type { TreeEntry } from '../../test/tree-entries.ts'",
						'export function findByName(params: TreeEntry): number {',
						'\treturn params.id',
						'}',
					]),
					'src/test/tree-entries.ts': TYPE_ONLY_ENTRIES,
				},
				imports: [HELPER_IMPORT],
				name: 'findByName',
				expectedCalls: ['findByName'],
			},
			'a helper importing a file that imports the production folder, called twice → one finding: one level only':
				{
					files: {
						[HELPER_FILE]: moduleOf([
							"import { findInTree } from './middle-entries.ts'",
							...FIND_BY_NAME,
						]),
						'src/widget/integration/middle-entries.ts': moduleOf([
							SUPPORT_IMPORT,
							'export { findInTree }',
						]),
						'src/test/tree-entries.ts': TREE_ENTRIES,
					},
					imports: [HELPER_IMPORT],
					name: 'findByName',
					expectedCalls: ['findByName'],
				},
			'a package source file importing nothing from the production folder, called twice → one finding':
				{
					files: { 'src/widget/add-widget.ts': ADD_WIDGET },
					imports: ["import { addWidget } from './add-widget.ts'"],
					name: 'addWidget',
					expectedCalls: ['addWidget'],
				},
			'a helper namespace-importing a file of the production folder, called twice → none': {
				files: {
					[HELPER_FILE]: moduleOf([
						"import * as tree from '../../test/tree-entries.ts'",
						'export function findByName(params: { id: number }): number {',
						'\treturn tree.findInTree(params)',
						'}',
					]),
					'src/test/tree-entries.ts': TREE_ENTRIES,
				},
				imports: [HELPER_IMPORT],
				name: 'findByName',
				expectedCalls: [],
			},
			'a helper with a side-effect-only import of a file that imports vitest, called twice → none':
				{
					files: {
						[HELPER_FILE]: moduleOf([
							"import '../../test/setup.ts'",
							'export function findByName(params: { id: number }): number {',
							'\treturn params.id',
							'}',
						]),
						'src/test/setup.ts': moduleOf(["import { vi } from 'vitest'", 'vi.fn()']),
					},
					imports: [HELPER_IMPORT],
					name: 'findByName',
					expectedCalls: [],
				},
			'a helper re-exported by an index the test imports it from, called twice → none': {
				files: {
					[HELPER_FILE]: HELPER_IMPORTS_TEST_FOLDER,
					'src/test/tree-entries.ts': TREE_ENTRIES,
					'src/widget/integration/index.ts': moduleOf([
						"export { findByName } from './integration-helpers.ts'",
					]),
				},
				imports: ["import { findByName } from './integration/index.ts'"],
				name: 'findByName',
				expectedCalls: [],
			},
			'a function imported relatively, the file given as an absolute path, called twice → one finding':
				{
					files: { 'src/widget/add-widget.ts': ADD_WIDGET },
					imports: ["import { addWidget } from '../widget/add-widget.ts'"],
					name: 'addWidget',
					expectedCalls: ['addWidget'],
					absolute: true,
				},
			'a helper value-importing the production folder, the file given as an absolute path, called twice → none':
				{
					files: {
						[HELPER_FILE]: HELPER_IMPORTS_TEST_FOLDER,
						'src/test/tree-entries.ts': TREE_ENTRIES,
					},
					imports: [HELPER_IMPORT],
					name: 'findByName',
					expectedCalls: [],
					absolute: true,
				},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const test = twiceTestOf({ imports: testCase.imports, names: [testCase.name] })
				const findings = runJson({
					files: { ...SUPPORT_PACKAGE, ...testCase.files, [TEST_FILE]: test },
					file: TEST_FILE,
					absolute: testCase.absolute ?? false,
				}).filter((finding) => finding.rule === 'act-repeats-call')

				expect(
					findings.map((finding) => ({ line: finding.line, severity: finding.severity })),
				).toEqual(
					testCase.expectedCalls.map((name) => ({
						line: lineOf({ text: test, needle: `${name}({ id: 2 })` }),
						severity: 'error',
					})),
				)
			})
	},
)
