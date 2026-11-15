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

function isFormatFinding(finding: RuleFinding): boolean {
	return finding.rule === 'act-format-check'
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

/** The act of a time bracket: the clock read with `clock` before and after the call, asserted by the given lines. */
function bracketOf(params: { clock: string; first: string; assertions: string[] }): string[] {
	const { clock, first, assertions } = params
	return runnerOf([
		`const before = ${clock}${first}`,
		'const stamp = await addWidget({ id: 1 })',
		`const after = ${clock}`,
		...assertions,
	])
}

const ORDER_ASSERTIONS = [
	'expect(stamp).toBeGreaterThanOrEqual(before)',
	'expect(stamp).toBeLessThanOrEqual(after)',
]

describe('act-format-check: a uuid shape in a regular expression', () => {
	const testCases: Record<string, FindingsCase> = {
		'toMatch with a uuid prefix pattern → one finding, at the literal': {
			units: ACT_UNITS,
			body: runnerOf([
				'const id = await addWidget({ id: 1 })',
				'expect(id).toMatch(/^[0-9a-f]{8}-/) // flag act-format-check',
			]),
		},
		'stringMatching with the dashed groups twice → one finding, at the literal': {
			units: ACT_UNITS,
			body: runnerOf([
				'const result = await addWidget({ id: 1 })',
				'expect(result).toEqual({',
				'\tid: expect.stringMatching(/-[0-9a-f]{4}-[0-9a-f]{4}-/), // flag act-format-check',
				'})',
			]),
		},
		'a pattern tested with .test( → one finding, at the literal': {
			units: ACT_UNITS,
			body: runnerOf([
				'const id = await addWidget({ id: 1 })',
				'expect(/[0-9a-f]{8}/.test(id)).toBe(true) // flag act-format-check',
			]),
		},
		'two uuid patterns → one finding per literal': {
			units: ACT_UNITS,
			body: runnerOf([
				'const first = await addWidget({ id: 1 })',
				'const second = await addWidget({ id: 2 })',
				'expect(first).toMatch(/^[0-9a-f]{8}-/) // flag act-format-check',
				'expect(second).toMatch(/^[0-9a-f]{8}-/) // flag act-format-check',
			]),
		},
		'a uuid pattern asserted in a plain test outside any act → one finding, at the literal': {
			units: ACT_UNITS,
			body: [
				...IMPORTS,
				"it('names the widget', async () => {",
				'\tconst id = await addWidget({ id: 1 })',
				'\texpect(id).toMatch(/^[0-9a-f]{8}-/) // flag act-format-check',
				'})',
			],
		},
		'a pattern with no uuid shape → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const id = await addWidget({ id: 1 })',
				'expect(id).toMatch(/^widget-\\d+$/)',
			]),
		},
		'a pattern with one dashed group of four → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const id = await addWidget({ id: 1 })',
				'expect(id).toMatch(/-[0-9a-f]{4}-/)',
			]),
		},
		'a uuid pattern used to rewrite a string, not asserted → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const id = await addWidget({ id: 1 })',
				"const masked = id.replace(/[0-9a-f]{8}/, 'x')",
				"expect(masked).toEqual('x-widget')",
			]),
		},
		'a uuid pattern asserted in a module that is not a Dialecte change → none': {
			testRules: false,
			units: ACT_UNITS,
			body: runnerOf([
				'const id = await addWidget({ id: 1 })',
				'expect(id).toMatch(/^[0-9a-f]{8}-/)',
			]),
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isFormatFinding))).toEqual(expected)
		})

	it('names the uuid shape, as an error', () => {
		const { text, params } = preparedOf({
			units: ACT_UNITS,
			body: runnerOf([
				'const id = await addWidget({ id: 1 })',
				'expect(id).toMatch(/^[0-9a-f]{8}-/)',
			]),
		})
		const [finding] = checkCodeRules(params).filter(isFormatFinding)
		expect({
			line: finding?.line,
			severity: finding?.severity,
			namesUuid: finding?.message.includes('uuid'),
		}).toEqual({
			line: lineOfText({ text, needle: 'expect(id)' }),
			severity: 'error',
			namesUuid: true,
		})
	})
})

describe('act-format-check: a time bracket asserted around the call', () => {
	const testCases: Record<string, FindingsCase> = {
		'Date.now before and after, asserted with the two comparison matchers → one finding, at the first binding':
			{
				units: ACT_UNITS,
				body: bracketOf({
					clock: 'Date.now()',
					first: ' // flag act-format-check',
					assertions: ORDER_ASSERTIONS,
				}),
			},
		'new Date before and after → one finding, at the first binding': {
			units: ACT_UNITS,
			body: bracketOf({
				clock: 'new Date()',
				first: ' // flag act-format-check',
				assertions: ORDER_ASSERTIONS,
			}),
		},
		'performance.now before and after → one finding, at the first binding': {
			units: ACT_UNITS,
			body: bracketOf({
				clock: 'performance.now()',
				first: ' // flag act-format-check',
				assertions: ORDER_ASSERTIONS,
			}),
		},
		'the strict comparison matchers → one finding, at the first binding': {
			units: ACT_UNITS,
			body: bracketOf({
				clock: 'Date.now()',
				first: ' // flag act-format-check',
				assertions: ['expect(stamp).toBeGreaterThan(before)', 'expect(stamp).toBeLessThan(after)'],
			}),
		},
		'a comparison written inside expect → one finding, at the first binding': {
			units: ACT_UNITS,
			body: bracketOf({
				clock: 'Date.now()',
				first: ' // flag act-format-check',
				assertions: ['expect(before <= stamp).toBe(true)', 'expect(stamp <= after).toBe(true)'],
			}),
		},
		'the two bindings asserted through one matcher each of both kinds → one finding': {
			units: ACT_UNITS,
			body: bracketOf({
				clock: 'Date.now()',
				first: ' // flag act-format-check',
				assertions: [
					'expect(stamp).toBeGreaterThanOrEqual(before)',
					'expect(after >= stamp).toBe(true)',
				],
			}),
		},
		'a bench reading performance.now twice and printing the difference → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const started = performance.now()',
				'await addWidget({ id: 1 })',
				'const finished = performance.now()',
				'console.log(`add took ${finished - started} ms`)',
			]),
		},
		'a bench whose difference is never asserted, asserting only the result → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const before = Date.now()',
				'const stamp = await addWidget({ id: 1 })',
				'const after = Date.now()',
				'report({ elapsed: after - before })',
				'expect(stamp).toEqual(1)',
			]),
		},
		'only one of the two clock bindings asserted → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const before = Date.now()',
				'const stamp = await addWidget({ id: 1 })',
				'const after = Date.now()',
				'report({ after })',
				'expect(stamp).toBeGreaterThanOrEqual(before)',
			]),
		},
		'two bindings compared in an if, not in expect → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const before = Date.now()',
				'const stamp = await addWidget({ id: 1 })',
				'const after = Date.now()',
				'if (before <= stamp && stamp <= after) report({ inside: true })',
			]),
		},
		'a stamp compared with a literal bound → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const stamp = await addWidget({ id: 1 })',
				'expect(stamp).toBeGreaterThan(0)',
			]),
		},
		'a time bracket asserted in a module that is not a Dialecte change → none': {
			testRules: false,
			units: ACT_UNITS,
			body: bracketOf({ clock: 'Date.now()', first: '', assertions: ORDER_ASSERTIONS }),
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isFormatFinding))).toEqual(expected)
		})

	it('names the time bracket, as an error', () => {
		const { text, params } = preparedOf({
			units: ACT_UNITS,
			body: bracketOf({ clock: 'Date.now()', first: '', assertions: ORDER_ASSERTIONS }),
		})
		const [finding] = checkCodeRules(params).filter(isFormatFinding)
		expect({
			line: finding?.line,
			severity: finding?.severity,
			namesTime: finding?.message.includes('time'),
		}).toEqual({
			line: lineOfText({ text, needle: 'const before' }),
			severity: 'error',
			namesTime: true,
		})
	})
})

describe('act-format-check: opt-out', () => {
	const REASON = "// dialecte-allow act-format-check: the timestamp writer's own test"
	const UUID_LINES = [
		'const id = await addWidget({ id: 1 })',
		'expect(id).toMatch(/^[0-9a-f]{8}-/)',
	]
	const PLAIN_TEST = [
		"it('names the widget', async () => {",
		'\tconst id = await addWidget({ id: 1 })',
		'\texpect(id).toMatch(/^[0-9a-f]{8}-/)',
		'})',
	]

	function allowedRun(params: { body: string[] }) {
		const text = moduleOf(params)
		const checked = paramsOf({ file: WIDGET_TEST_FILE, text, testRules: true, units: ACT_UNITS })
		return summarizedActAllow(
			applyAllowComments({ file: WIDGET_TEST_FILE, text, findings: checkCodeRules(checked) }),
		)
	}

	/** A runner whose act, declared after the given lines, holds the act lines. */
	function actAfter(params: { before: string[]; actLines: string[] }): string[] {
		return [
			...IMPORTS,
			...TABLE,
			'runWidgetTestCases.withExport({',
			'\ttestCases,',
			...params.before.map((line) => `\t${line}`),
			'\tact: async () => {',
			...params.actLines.map((line) => `\t\t${line}`),
			'\t},',
			'})',
		]
	}

	const BRACKET = [
		'const before = Date.now()',
		'const stamp = await addWidget({ id: 1 })',
		'const after = Date.now()',
		...ORDER_ASSERTIONS,
	]

	const SILENCED = { findings: [], allowed: { 'act-format-check': 1 } }

	it('a reason on the line before an arrow act silences the bracket and is counted', () => {
		expect(allowedRun({ body: actAfter({ before: [REASON], actLines: BRACKET }) })).toEqual(
			SILENCED,
		)
	})

	it('a reason on the line before the first binding silences the bracket and is counted', () => {
		expect(allowedRun({ body: runnerOf([REASON, ...BRACKET]) })).toEqual(SILENCED)
	})

	it('a reason on the line before a uuid pattern silences it and is counted', () => {
		expect(
			allowedRun({
				body: runnerOf([UUID_LINES[0] as string, REASON, UUID_LINES[1] as string]),
			}),
		).toEqual(SILENCED)
	})

	it('a reason on the line before the act silences a uuid pattern inside it and is counted', () => {
		expect(allowedRun({ body: actAfter({ before: [REASON], actLines: UUID_LINES }) })).toEqual(
			SILENCED,
		)
	})

	it('a reason on the line before a uuid pattern in a plain test silences it and is counted', () => {
		const [open, bind, match, close] = PLAIN_TEST as [string, string, string, string]
		expect(allowedRun({ body: [...IMPORTS, open, bind, `\t${REASON}`, match, close] })).toEqual(
			SILENCED,
		)
	})

	it('an act-level reason does not reach a uuid pattern in a plain test outside the act', () => {
		const body = [
			...IMPORTS,
			...TABLE,
			'runWidgetTestCases.withExport({',
			'\ttestCases,',
			`\t${REASON}`,
			'\tact: async () => {',
			'\t\tawait addWidget({ id: 1 })',
			'\t},',
			'})',
			...PLAIN_TEST,
		]
		const text = moduleOf({ body })
		expect(allowedRun({ body })).toEqual({
			findings: [
				{ rule: 'unused-allow', line: lineOfText({ text, needle: 'dialecte-allow' }) },
				{ rule: 'act-format-check', line: lineOfText({ text, needle: 'toMatch(' }) },
			],
			allowed: {},
		})
	})
})
