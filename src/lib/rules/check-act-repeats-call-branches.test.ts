import { ACT_UNITS } from '../../../test/fixture-rules-cases.constants.ts'
import { isActFinding, positionsOf, preparedOf } from '../../../test/fixture-rules-cases.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'

const IMPORTS = ["import { addWidget } from './add-widget.ts'"]

const TABLE = ['const testCases = {', "\t'a widget': { sourceXml: '<Root/>' },", '}']

/** A runner whose act is the given lines, after the imports and the table. */
function runnerOf(actLines: string[]): string[] {
	return [
		...IMPORTS,
		...TABLE,
		'runWidgetTestCases.withExport({',
		'\ttestCases,',
		'\tact: async ({ flag }) => {',
		...actLines.map((line) => `\t\t${line}`),
		'\t},',
		'})',
	]
}

describe('act-repeats-call: call sites in branches that exclude each other', () => {
	const testCases: Record<string, FindingsCase> = {
		'the unit called once in an if arm and once in its else arm → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'if (flag) {',
				'\tawait addWidget({ id: 1 })',
				'} else {',
				'\tawait addWidget({ id: 2 })',
				'}',
			]),
		},
		'the unit called once in each arm and once after the if and else → one finding, at the call after':
			{
				units: ACT_UNITS,
				body: runnerOf([
					'if (flag) {',
					'\tawait addWidget({ id: 1 })',
					'} else {',
					'\tawait addWidget({ id: 2 })',
					'}',
					'await addWidget({ id: 3 }) // flag act-repeats-call',
				]),
			},
		'the unit called in each arm of a conditional expression → none': {
			units: ACT_UNITS,
			body: runnerOf(['const stamp = flag ? addWidget({ id: 1 }) : addWidget({ id: 2 })']),
		},
		'the unit called once in each of two switch case arms → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'switch (flag) {',
				'case 1:',
				'\tawait addWidget({ id: 1 })',
				'\tbreak',
				'case 2:',
				'\tawait addWidget({ id: 2 })',
				'\tbreak',
				'}',
			]),
		},
		'two calls in the if arm and one in the else arm → one finding, at the second call of the if arm':
			{
				units: ACT_UNITS,
				body: runnerOf([
					'if (flag) {',
					'\tawait addWidget({ id: 1 })',
					'\tawait addWidget({ id: 2 }) // flag act-repeats-call',
					'} else {',
					'\tawait addWidget({ id: 3 })',
					'}',
				]),
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isActFinding))).toEqual(expected)
		})
})

describe('act-repeats-call: message', () => {
	it('two calls in one arm and one in the other count the arm that calls most, as two times', () => {
		const { params } = preparedOf({
			units: ACT_UNITS,
			body: runnerOf([
				'if (flag) {',
				'\tawait addWidget({ id: 1 })',
				'\tawait addWidget({ id: 2 })',
				'} else {',
				'\tawait addWidget({ id: 3 })',
				'}',
			]),
		})

		expect(
			checkCodeRules(params)
				.filter(isActFinding)
				.map((finding) => finding.message),
		).toEqual(["`addWidget` called 2 times in one act: a verb's test makes the one call"])
	})
})
