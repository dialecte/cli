import { lineOf, moduleOf, runJson, twiceTestOf } from '../../test/rules-import-run.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

const TEST_FILE = 'src/widget/add-widget.test.ts'

const DIALECTE_PACKAGE = {
	'package.json': `${JSON.stringify({
		name: '@dialecte/demo',
		dialecte: { tdd: { production: ['src/harness'] } },
	})}\n`,
	'src/v1/generated/definition.generated.ts': 'export {}\n',
}

const ADD_WIDGET = moduleOf([
	'export function addWidget(params: { id: number }): number {',
	'\treturn params.id',
	'}',
])
const BUILD_SOURCE = moduleOf([
	'export function buildSource(): string {',
	"\treturn '<Root/>'",
	'}',
])
const VITEST_HELPER = moduleOf([
	"import { vi } from 'vitest'",
	'export function buildSource(): string {',
	'\tvi.fn()',
	"\treturn '<Root/>'",
	'}',
])

describe(
	'dialecte rules: xml-replace through an import',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const TEST = moduleOf([
			"import { BASE } from './widget-documents.ts'",
			'const testCases = {',
			"\t'a widget variant': {",
			"\t\tsourceXml: BASE.replace('a', 'b'),",
			'\t},',
			'}',
			'runWidgetTestCases.withExport({ testCases, act: async () => {} })',
		])

		function replaceLinesOf(files: Record<string, string>): number[] {
			return runJson({ files: { ...DIALECTE_PACKAGE, ...files }, file: TEST_FILE })
				.filter((finding) => finding.rule === 'xml-replace')
				.map((finding) => finding.line)
		}

		it('a BASE that is an XML literal in the module the test imports it from → one finding, at the replace', () => {
			expect(
				replaceLinesOf({
					[TEST_FILE]: TEST,
					'src/widget/widget-documents.ts': moduleOf(['export const BASE = `<Root/>`']),
				}),
			).toEqual([4])
		})

		it('a BASE re-exported from a third file → none: the import is followed one level', () => {
			expect(
				replaceLinesOf({
					[TEST_FILE]: TEST,
					'src/widget/widget-documents.ts': moduleOf(["export { BASE } from './base-document.ts'"]),
					'src/widget/base-document.ts': moduleOf(['export const BASE = `<Root/>`']),
				}),
			).toEqual([])
		})

		it('a BASE that is not XML in the module the test imports it from → none', () => {
			expect(
				replaceLinesOf({
					[TEST_FILE]: TEST,
					'src/widget/widget-documents.ts': moduleOf(["export const BASE = 'a-name'"]),
				}),
			).toEqual([])
		})
	},
)

describe(
	'dialecte rules: the unit under test resolved from the imports',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		type UnitCase = { files: Record<string, string>; test: string; expectedCalls: string[] }

		const INDEX = moduleOf(["export { addWidget } from './widget/add-widget.ts'"])
		const INDEX_WITH_SUPPORT = moduleOf([
			"export { addWidget } from './widget/add-widget.ts'",
			"export { buildSource } from './harness/build-source.ts'",
		])

		const testCases: Record<string, UnitCase> = {
			'a function imported through the index that re-exports its file, called twice → one finding':
				{
					files: { 'src/index.ts': INDEX, 'src/widget/add-widget.ts': ADD_WIDGET },
					test: twiceTestOf({
						imports: ["import { addWidget } from '../index.ts'"],
						names: ['addWidget'],
					}),
					expectedCalls: ['addWidget'],
				},
			'a function imported through an index that star-exports its file, called twice → one finding':
				{
					files: {
						'src/index.ts': moduleOf(["export * from './widget/add-widget.ts'"]),
						'src/widget/add-widget.ts': ADD_WIDGET,
					},
					test: twiceTestOf({
						imports: ["import { addWidget } from '../index.ts'"],
						names: ['addWidget'],
					}),
					expectedCalls: ['addWidget'],
				},
			'a support function through an index that star-exports its folder file, called twice → none':
				{
					files: {
						'src/index.ts': moduleOf(["export * from './harness/build-source.ts'"]),
						'src/harness/build-source.ts': BUILD_SOURCE,
					},
					test: twiceTestOf({
						imports: ["import { buildSource } from '../index.ts'"],
						names: ['buildSource'],
					}),
					expectedCalls: [],
				},
			'a support function re-exported under another name, called twice under that name → none': {
				files: {
					'src/index.ts': moduleOf([
						"export { buildSource as makeSource } from './harness/build-source.ts'",
					]),
					'src/harness/build-source.ts': BUILD_SOURCE,
				},
				test: twiceTestOf({
					imports: ["import { makeSource } from '../index.ts'"],
					names: ['makeSource'],
				}),
				expectedCalls: [],
			},
			'a unit re-exported under another name, called twice under that name → one finding': {
				files: {
					'src/index.ts': moduleOf([
						"export { addWidget as insertWidget } from './widget/add-widget.ts'",
					]),
					'src/widget/add-widget.ts': ADD_WIDGET,
				},
				test: twiceTestOf({
					imports: ["import { insertWidget } from '../index.ts'"],
					names: ['insertWidget'],
				}),
				expectedCalls: ['insertWidget'],
			},
			'a function of a folder the package declares production, called twice → none': {
				files: { 'src/harness/build-source.ts': BUILD_SOURCE },
				test: twiceTestOf({
					imports: ["import { buildSource } from '../harness/build-source.ts'"],
					names: ['buildSource'],
				}),
				expectedCalls: [],
			},
			'a function of a file importing vitest, called twice → none': {
				files: { 'src/widget/source-helper.ts': VITEST_HELPER },
				test: twiceTestOf({
					imports: ["import { buildSource } from './source-helper.ts'"],
					names: ['buildSource'],
				}),
				expectedCalls: [],
			},
			'a unit and a support function through one index, each called twice → one finding, for the unit only':
				{
					files: {
						'src/index.ts': INDEX_WITH_SUPPORT,
						'src/widget/add-widget.ts': ADD_WIDGET,
						'src/harness/build-source.ts': BUILD_SOURCE,
					},
					test: twiceTestOf({
						imports: ["import { addWidget, buildSource } from '../index.ts'"],
						names: ['buildSource', 'addWidget'],
					}),
					expectedCalls: ['addWidget'],
				},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const findings = runJson({
					files: { ...DIALECTE_PACKAGE, ...testCase.files, [TEST_FILE]: testCase.test },
					file: TEST_FILE,
				}).filter((finding) => finding.rule === 'act-repeats-call')

				expect(
					findings.map((finding) => ({ line: finding.line, severity: finding.severity })),
				).toEqual(
					testCase.expectedCalls.map((name) => ({
						line: lineOf({ text: testCase.test, needle: `${name}({ id: 2 })` }),
						severity: 'error',
					})),
				)
			})
	},
)
