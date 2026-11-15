import { ACT_UNITS, WIDGET_TEST_FILE } from '../../../test/fixture-rules-cases.constants.ts'
import {
	isActFinding,
	lineOfText,
	moduleOf,
	paramsOf,
	positionsOf,
	preparedOf,
	summarizedActAllow,
} from '../../../test/fixture-rules-cases.ts'
import { applyAllowComments } from './allow-comments.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'

const IMPORTS = [
	"import { addWidget, removeWidget } from './add-widget.ts'",
	"import { buildSource } from '../test/build-source.ts'",
]

const TABLE = ['const testCases = {', "\t'a widget': { sourceXml: '<Root/>' },", '}']

/** A runner whose act is the given lines, after the imports and the table. */
function runnerOf(actLines: string[]): string[] {
	return [
		...IMPORTS,
		...TABLE,
		'runWidgetTestCases.withExport({',
		'\ttestCases,',
		'\tact: async ({ target, doc }) => {',
		...actLines.map((line) => `\t\t${line}`),
		'\t},',
		'})',
	]
}

describe('act-repeats-call: the unit under test called more than once in an act', () => {
	const testCases: Record<string, FindingsCase> = {
		'a bound method called in three transaction callbacks → one finding, at the second call': {
			units: ACT_UNITS,
			body: runnerOf([
				'await target.transaction(async (tx) => {',
				'\tawait tx.widget.add({ id: 1 })',
				'})',
				'await target.transaction(async (tx) => {',
				'\tawait tx.widget.add({ id: 2 }) // flag act-repeats-call',
				'})',
				'await target.transaction(async (tx) => {',
				'\tawait tx.widget.add({ id: 3 })',
				'})',
			]),
		},
		'an imported verb called once inside a for loop → one finding, at that call': {
			units: ACT_UNITS,
			body: runnerOf([
				'for (const id of [1, 2]) {',
				'\tawait addWidget({ id }) // flag act-repeats-call',
				'}',
			]),
		},
		'an imported verb called once inside a forEach callback → one finding, at that call': {
			units: ACT_UNITS,
			body: runnerOf([
				'[1, 2].forEach(async (id) => {',
				'\tawait addWidget({ id }) // flag act-repeats-call',
				'})',
			]),
		},
		'a call and a second call inside expect(...).rejects → one finding, at the expect line': {
			units: ACT_UNITS,
			body: runnerOf([
				'await target.transaction(async (tx) => {',
				'\tawait tx.widget.add({ id: 1 })',
				'\tawait expect(tx.widget.add({ id: 1 })).rejects.toThrow("duplicate") // flag act-repeats-call',
				'})',
			]),
		},
		'two units each called twice → one finding per unit, at each second call': {
			units: ACT_UNITS,
			body: runnerOf([
				'await addWidget({ id: 1 })',
				'await removeWidget({ id: 1 })',
				'await addWidget({ id: 2 }) // flag act-repeats-call',
				'await removeWidget({ id: 2 }) // flag act-repeats-call',
			]),
		},
		'the unit imported through the package index and called twice → one finding': {
			units: ACT_UNITS,
			body: [
				"import { addWidget } from './index.ts'",
				...TABLE,
				'runWidgetTestCases.withExport({',
				'\ttestCases,',
				'\tact: async () => {',
				'\t\tawait addWidget({ id: 1 })',
				'\t\tawait addWidget({ id: 2 }) // flag act-repeats-call',
				'\t},',
				'})',
			],
		},
		'a call through a dotted query binding, called twice → one finding, at the second call': {
			units: ACT_UNITS,
			body: runnerOf([
				'await doc.query.widget.find({ id: 1 })',
				'await doc.query.widget.find({ id: 2 }) // flag act-repeats-call',
			]),
		},
		'a call in a for body and one more after the loop → one finding, at the call after the loop': {
			units: ACT_UNITS,
			body: runnerOf([
				'for (const id of [1, 2]) {',
				'\tawait addWidget({ id })',
				'}',
				'await addWidget({ id: 3 }) // flag act-repeats-call',
			]),
		},
		'the verb once and the test support builder twice → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const first = buildSource()',
				'await addWidget({ source: first })',
				'const second = buildSource()',
			]),
		},
		'the verb called once → none': {
			units: ACT_UNITS,
			body: runnerOf(['await addWidget({ id: 1 })']),
		},
		'two different units called once each → none': {
			units: ACT_UNITS,
			body: runnerOf(['await addWidget({ id: 1 })', 'await removeWidget({ id: 1 })']),
		},
		'getStagedOperations called twice (one segment past the binding) → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'await target.transaction(async (tx) => {',
				'\ttx.getStagedOperations()',
				'\ttx.getStagedOperations()',
				'})',
			]),
		},
		'a core group called twice → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'await target.transaction(async (tx) => {',
				'\ttx.progress.plan()',
				'\ttx.progress.plan()',
				'})',
			]),
		},
		'a query read called twice → none': {
			units: ACT_UNITS,
			body: runnerOf(['doc.query.getRecord({ id: 1 })', 'doc.query.getRecord({ id: 2 })']),
		},
		'an import that is not the package source called twice → none': {
			units: ACT_UNITS,
			body: [
				"import { format } from 'some-library'",
				...TABLE,
				'runWidgetTestCases.withExport({',
				'\ttestCases,',
				'\tact: async () => {',
				'\t\tformat(1)',
				'\t\tformat(2)',
				'\t},',
				'})',
			],
		},
		'the verb called once in each of two acts → none': {
			units: ACT_UNITS,
			body: [
				...IMPORTS,
				...TABLE,
				'runWidgetTestCases.withExport({',
				'\ttestCases,',
				'\tact: async () => {',
				'\t\tawait addWidget({ id: 1 })',
				'\t},',
				'})',
				'runWidgetTestCases.withoutExport({',
				'\ttestCases,',
				'\tact: async () => {',
				'\t\tawait addWidget({ id: 2 })',
				'\t},',
				'})',
			],
		},
		'the verb called twice outside any act → none': {
			units: ACT_UNITS,
			body: [
				...IMPORTS,
				"it('adds twice', async () => {",
				'\tawait addWidget({ id: 1 })',
				'\tawait addWidget({ id: 2 })',
				'})',
			],
		},
		'an act declared in a sibling file and imported → none': {
			units: ACT_UNITS,
			body: [
				"import { importedAct } from './acts.ts'",
				...TABLE,
				'runWidgetTestCases.withExport({ testCases, act: importedAct })',
			],
		},
		'the verb called twice in a module that is not a Dialecte change → none': {
			testRules: false,
			units: ACT_UNITS,
			body: runnerOf(['await addWidget({ id: 1 })', 'await addWidget({ id: 2 })']),
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isActFinding))).toEqual(expected)
		})
})

describe('act-repeats-call: message', () => {
	it('names the unit and the count of call sites, as an error', () => {
		const { params } = preparedOf({
			units: ACT_UNITS,
			body: runnerOf([
				'await target.transaction(async (tx) => {',
				'\tawait tx.widget.add({ id: 1 })',
				'})',
				'await target.transaction(async (tx) => {',
				'\tawait tx.widget.add({ id: 2 })',
				'})',
				'await target.transaction(async (tx) => {',
				'\tawait tx.widget.add({ id: 3 })',
				'})',
			]),
		})
		expect(
			checkCodeRules(params)
				.filter((finding) => finding.rule === 'act-repeats-call')
				.map((finding) => ({ message: finding.message, severity: finding.severity })),
		).toEqual([
			{
				message: "`tx.widget.add` called 3 times in one act: a verb's test makes the one call",
				severity: 'error',
			},
		])
	})

	it('counts two call sites of an imported verb under the name the module gives it', () => {
		const { params } = preparedOf({
			units: { ...ACT_UNITS, ownImports: new Map([['add', 'unit']]) },
			body: [
				"import { addWidget as add } from './add-widget.ts'",
				...TABLE,
				'runWidgetTestCases.withExport({',
				'\ttestCases,',
				'\tact: async () => {',
				'\t\tawait add({ id: 1 })',
				'\t\tawait add({ id: 2 })',
				'\t},',
				'})',
			],
		})
		expect(
			checkCodeRules(params)
				.filter((finding) => finding.rule === 'act-repeats-call')
				.map((finding) => finding.message),
		).toEqual(["`add` called 2 times in one act: a verb's test makes the one call"])
	})
})

describe('act-repeats-call: opt-out on the act', () => {
	const REASON = '// dialecte-allow act-repeats-call: the retry is the behaviour under test'
	const REPEATS = ['await addWidget({ id: 1 })', 'await addWidget({ id: 2 })']

	function allowedRun(params: { body: string[] }) {
		const text = moduleOf(params)
		const checked = paramsOf({ file: WIDGET_TEST_FILE, text, testRules: true, units: ACT_UNITS })
		return summarizedActAllow(
			applyAllowComments({ file: WIDGET_TEST_FILE, text, findings: checkCodeRules(checked) }),
		)
	}

	it('a reason on the line before an inline act declaration silences it and is counted', () => {
		expect(
			allowedRun({
				body: [
					...IMPORTS,
					...TABLE,
					'runWidgetTestCases.withExport({',
					'\ttestCases,',
					`\t${REASON}`,
					'\tact: async function act() {',
					...REPEATS.map((line) => `\t\t${line}`),
					'\t},',
					'})',
				],
			}),
		).toEqual({ findings: [], allowed: { 'act-repeats-call': 1 } })
	})

	it('a reason on the line before an arrow act silences it and is counted', () => {
		expect(
			allowedRun({
				body: [
					...IMPORTS,
					...TABLE,
					'runWidgetTestCases.withExport({',
					'\ttestCases,',
					`\t${REASON}`,
					'\tact: async () => {',
					...REPEATS.map((line) => `\t\t${line}`),
					'\t},',
					'})',
				],
			}),
		).toEqual({ findings: [], allowed: { 'act-repeats-call': 1 } })
	})

	it('a reason before a named act function the runner references silences it and is counted', () => {
		expect(
			allowedRun({
				body: [
					...IMPORTS,
					...TABLE,
					REASON,
					'async function retryAct() {',
					...REPEATS.map((line) => `\t${line}`),
					'}',
					'runWidgetTestCases.withExport({ testCases, act: retryAct })',
				],
			}),
		).toEqual({ findings: [], allowed: { 'act-repeats-call': 1 } })
	})

	it('a reason on the first act leaves the finding of a second act', () => {
		const body = [
			...IMPORTS,
			...TABLE,
			REASON,
			'async function retryAct() {',
			...REPEATS.map((line) => `\t${line}`),
			'}',
			'async function secondAct() {',
			'\tawait addWidget({ id: 3 })',
			'\tawait addWidget({ id: 4 })',
			'}',
			'runWidgetTestCases.withExport({ testCases, act: retryAct })',
			'runWidgetTestCases.withoutExport({ testCases, act: secondAct })',
		]
		const text = moduleOf({ body })
		expect(allowedRun({ body })).toEqual({
			findings: [
				{
					rule: 'act-repeats-call',
					line: lineOfText({ text, needle: 'await addWidget({ id: 4 })' }),
				},
			],
			allowed: { 'act-repeats-call': 1 },
		})
	})
})
