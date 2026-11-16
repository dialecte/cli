import { ACT_UNITS, WIDGET_TEST_FILE } from '../../../test/fixture-rules-cases.constants.ts'
import {
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
import type { RuleFinding } from './check-code-rules.types.ts'

const IMPORTS = ["import { addWidget } from './add-widget.ts'"]

const TABLE = ['const testCases = {', "\t'a widget': { sourceXml: '<Root/>' },", '}']

const SNAPSHOT_MESSAGE =
	'a captured state compared later: the behaviour is the call\'s outcome; "unchanged" is a case of its own only where it is the behaviour'

function isSnapshotFinding(finding: RuleFinding): boolean {
	return finding.rule === 'act-snapshot'
}

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

describe('act-snapshot: a captured state compared with the state after the call', () => {
	const testCases: Record<string, FindingsCase> = {
		'a document info cloned before the call and compared after → one finding, at the clone': {
			units: ACT_UNITS,
			body: runnerOf([
				'const info = await doc.query.getDocumentInfo()',
				'const copy = structuredClone(info) // flag act-snapshot',
				'await addWidget({ id: 1 })',
				'const after = await doc.query.getDocumentInfo()',
				'expect(after).toEqual(copy)',
			]),
		},
		'a clone taken straight from the call → one finding, at the clone': {
			units: ACT_UNITS,
			body: runnerOf([
				'const copy = structuredClone(await doc.query.getDocumentInfo()) // flag act-snapshot',
				'await addWidget({ id: 1 })',
				'expect(await doc.query.getDocumentInfo()).toEqual(copy)',
			]),
		},
		'the info itself also compared as expected, besides its clone → one finding per binding': {
			units: ACT_UNITS,
			body: runnerOf([
				'const info = await doc.query.getDocumentInfo() // flag act-snapshot',
				'const copy = structuredClone(info) // flag act-snapshot',
				'await addWidget({ id: 1 })',
				'const after = await doc.query.getDocumentInfo()',
				'expect(after).toEqual(copy)',
				'expect(after).toBe(info)',
			]),
		},
		'staged operations read before the call and compared after → one finding, at the binding': {
			units: ACT_UNITS,
			body: runnerOf([
				'await target.transaction(async (tx) => {',
				'\tconst staged = tx.getStagedOperations() // flag act-snapshot',
				'\tawait addWidget({ id: 1 })',
				'\texpect(tx.getStagedOperations()).toEqual(staged)',
				'})',
			]),
		},
		'a snapshot bound before the call and given to toStrictEqual → one finding': {
			units: ACT_UNITS,
			body: runnerOf([
				'const before = doc.getSnapshot({ scope: 1 }) // flag act-snapshot',
				'await addWidget({ id: 1 })',
				'expect(doc.getSnapshot({ scope: 1 })).toStrictEqual(before)',
			]),
		},
		'a snapshot bound before the call and given to toBe → one finding': {
			units: ACT_UNITS,
			body: runnerOf([
				'const before = doc.getSnapshot({ scope: 1 }) // flag act-snapshot',
				'await addWidget({ id: 1 })',
				'expect(doc.getSnapshot({ scope: 1 })).toBe(before)',
			]),
		},
		'two captured bindings each compared later → one finding per binding, at each line': {
			units: ACT_UNITS,
			body: runnerOf([
				'const first = doc.getSnapshot({ scope: 1 }) // flag act-snapshot',
				'const second = doc.getSnapshot({ scope: 2 }) // flag act-snapshot',
				'await addWidget({ id: 1 })',
				'expect(doc.getSnapshot({ scope: 1 })).toEqual(first)',
				'expect(doc.getSnapshot({ scope: 2 })).toEqual(second)',
			]),
		},
		'one binding compared in two assertions → one finding, not two': {
			units: ACT_UNITS,
			body: runnerOf([
				'const before = doc.getSnapshot({ scope: 1 }) // flag act-snapshot',
				'await addWidget({ id: 1 })',
				'expect(doc.getSnapshot({ scope: 1 })).toEqual(before)',
				'expect(doc.getSnapshot({ scope: 2 })).toEqual(before)',
			]),
		},
		'staged operations spread into a list in a transaction callback and returned, compared later as a property → one finding, at the binding':
			{
				units: ACT_UNITS,
				body: runnerOf([
					'const outcome = await target.transaction(async (tx) => {',
					'\tconst stagedBefore = [...tx.getStagedOperations()] // flag act-snapshot',
					'\tawait addWidget({ id: 1 })',
					'\treturn { stagedBefore, stagedAfter: tx.getStagedOperations() }',
					'})',
					'expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)',
				]),
			},
		'a document info spread into an object before the call and compared after → one finding, at the spread':
			{
				units: ACT_UNITS,
				body: runnerOf([
					'const copy = { ...await doc.query.getDocumentInfo() } // flag act-snapshot',
					'await addWidget({ id: 1 })',
					'const after = await doc.query.getDocumentInfo()',
					'expect(after).toEqual(copy)',
				]),
			},
		'a property read of the outcome whose name is no capture binding → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const outcome = await target.transaction(async (tx) => {',
				'\tconst stagedBefore = [...tx.getStagedOperations()]',
				'\tawait addWidget({ id: 1 })',
				'\treturn { stagedBefore, count: 1, stagedAfter: [...tx.getStagedOperations()] }',
				'})',
				'expect(outcome.stagedAfter).toEqual(outcome.count)',
			]),
		},
		'a spread of a value that captures no state, compared later → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const widgets = [1, 2]',
				'const copy = [...widgets]',
				'await addWidget({ id: 1 })',
				'expect(widgets).toEqual(copy)',
			]),
		},
		'the staged operations compared with an empty list after a caught refusal → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'await target.transaction(async (tx) => {',
				"\tawait expect(addWidget({ id: 1 })).rejects.toThrow('duplicate')",
				'\texpect(tx.getStagedOperations()).toEqual([])',
				'})',
			]),
		},
		'a snapshot bound after the call and compared with a literal → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'await addWidget({ id: 1 })',
				'const after = doc.getSnapshot({ scope: 1 })',
				"expect(after).toEqual({ ids: ['a'] })",
			]),
		},
		'a snapshot bound after the call and only read from → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'await addWidget({ id: 1 })',
				'const after = await doc.query.getDocumentInfo()',
				'expect(after.size).toBe(1)',
			]),
		},
		'a snapshot bound before the call and never an expected argument → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const before = doc.getSnapshot({ scope: 1 })',
				'await addWidget({ id: 1, known: before.ids })',
				'expect(doc.getSnapshot({ scope: 1 }).ids).toEqual([])',
			]),
		},
		'a binding from a call that captures no state compared later → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const ids = await doc.query.listIds()',
				'await addWidget({ id: 1 })',
				'expect(await doc.query.listIds()).toEqual(ids)',
			]),
		},
		'a captured state compared in a test outside any act → none': {
			units: ACT_UNITS,
			body: [
				...IMPORTS,
				"it('keeps the staged operations', async () => {",
				'\tconst staged = doc.getStagedOperations()',
				'\tawait addWidget({ id: 1 })',
				'\texpect(doc.getStagedOperations()).toEqual(staged)',
				'})',
			],
		},
		'a captured state compared in a module that is not a Dialecte change → none': {
			testRules: false,
			units: ACT_UNITS,
			body: runnerOf([
				'const before = doc.getSnapshot({ scope: 1 })',
				'await addWidget({ id: 1 })',
				'expect(doc.getSnapshot({ scope: 1 })).toEqual(before)',
			]),
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isSnapshotFinding))).toEqual(expected)
		})
})

describe('act-snapshot: message', () => {
	it('is an error with the fixed text, at the binding', () => {
		const { text, params } = preparedOf({
			units: ACT_UNITS,
			body: runnerOf([
				'const before = doc.getSnapshot({ scope: 1 })',
				'await addWidget({ id: 1 })',
				'expect(doc.getSnapshot({ scope: 1 })).toEqual(before)',
			]),
		})
		expect(
			checkCodeRules(params)
				.filter(isSnapshotFinding)
				.map((finding) => ({
					line: finding.line,
					message: finding.message,
					severity: finding.severity,
				})),
		).toEqual([
			{
				line: lineOfText({ text, needle: 'const before' }),
				message: SNAPSHOT_MESSAGE,
				severity: 'error',
			},
		])
	})
})

describe('act-snapshot: opt-out', () => {
	const REASON = '// dialecte-allow act-snapshot: unchanged is the behaviour under test'
	const CAPTURE = [
		'const before = doc.getSnapshot({ scope: 1 })',
		'await addWidget({ id: 1 })',
		'expect(doc.getSnapshot({ scope: 1 })).toEqual(before)',
	]

	function allowedRun(params: { body: string[] }) {
		const text = moduleOf(params)
		const checked = paramsOf({ file: WIDGET_TEST_FILE, text, testRules: true, units: ACT_UNITS })
		return summarizedActAllow(
			applyAllowComments({ file: WIDGET_TEST_FILE, text, findings: checkCodeRules(checked) }),
		)
	}

	it('a reason on the line before the binding silences it and is counted', () => {
		expect(
			allowedRun({
				body: runnerOf([REASON, ...CAPTURE]),
			}),
		).toEqual({ findings: [], allowed: { 'act-snapshot': 1 } })
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
					'\tact: async ({ doc }) => {',
					...CAPTURE.map((line) => `\t\t${line}`),
					'\t},',
					'})',
				],
			}),
		).toEqual({ findings: [], allowed: { 'act-snapshot': 1 } })
	})

	it('a reason before a named act function silences it and is counted', () => {
		expect(
			allowedRun({
				body: [
					...IMPORTS,
					...TABLE,
					REASON,
					'async function unchangedAct({ doc }) {',
					...CAPTURE.map((line) => `\t${line}`),
					'}',
					'runWidgetTestCases.withExport({ testCases, act: unchangedAct })',
				],
			}),
		).toEqual({ findings: [], allowed: { 'act-snapshot': 1 } })
	})

	it('a reason on the first act leaves the finding of a second act', () => {
		const body = [
			...IMPORTS,
			...TABLE,
			REASON,
			'async function firstAct({ doc }) {',
			...CAPTURE.map((line) => `\t${line}`),
			'}',
			'async function secondAct({ doc }) {',
			'\tconst staged = doc.getSnapshot({ scope: 2 })',
			'\tawait addWidget({ id: 2 })',
			'\texpect(doc.getSnapshot({ scope: 2 })).toEqual(staged)',
			'}',
			'runWidgetTestCases.withExport({ testCases, act: firstAct })',
			'runWidgetTestCases.withoutExport({ testCases, act: secondAct })',
		]
		const text = moduleOf({ body })
		expect(allowedRun({ body })).toEqual({
			findings: [
				{
					rule: 'act-snapshot',
					line: lineOfText({ text, needle: 'const staged' }),
				},
			],
			allowed: { 'act-snapshot': 1 },
		})
	})
})
