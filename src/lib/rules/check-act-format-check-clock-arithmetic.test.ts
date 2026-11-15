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
		'\tact: async () => {',
		...actLines.map((line) => `\t\t${line}`),
		'\t},',
		'})',
	]
}

describe('act-format-check: a time bracket asserted through arithmetic on the clock bindings', () => {
	const testCases: Record<string, FindingsCase> = {
		'the clock bindings offset by a slack inside the matcher arguments → one finding, at the first binding':
			{
				units: ACT_UNITS,
				body: runnerOf([
					'const SLACK = 5',
					'const start = Date.now() // flag act-format-check',
					'const stamp = await addWidget({ id: 1 })',
					'const end = Date.now()',
					'expect(stamp).toBeGreaterThanOrEqual(start - SLACK)',
					'expect(stamp).toBeLessThanOrEqual(end + SLACK)',
				]),
			},
		'one clock binding offset by a slack beside a plain one → one finding, at the first binding': {
			units: ACT_UNITS,
			body: runnerOf([
				'const start = performance.now() // flag act-format-check',
				'const stamp = await addWidget({ id: 1 })',
				'const end = performance.now()',
				'expect(stamp).toBeGreaterThan(start - 10)',
				'expect(stamp).toBeLessThan(end)',
			]),
		},
		'a duration budget with the limit on the actual side, toBeGreaterThan → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const LIMIT = 500',
				'const start = Date.now()',
				'await addWidget({ id: 1 })',
				'const end = Date.now()',
				'expect(LIMIT).toBeGreaterThan(end - start)',
			]),
		},
		'a duration budget with the limit on the actual side, toBeGreaterThanOrEqual → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const LIMIT = 500',
				'const start = performance.now()',
				'await addWidget({ id: 1 })',
				'const end = performance.now()',
				'expect(LIMIT).toBeGreaterThanOrEqual(end - start)',
			]),
		},
		'a duration budget with the duration on the actual side, toBeLessThan → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const LIMIT = 500',
				'const start = Date.now()',
				'await addWidget({ id: 1 })',
				'const end = Date.now()',
				'expect(end - start).toBeLessThan(LIMIT)',
			]),
		},
		'the clock bindings only subtracted into a duration that is printed → none': {
			units: ACT_UNITS,
			body: runnerOf([
				'const start = Date.now()',
				'await addWidget({ id: 1 })',
				'const end = Date.now()',
				'console.log(end - start)',
			]),
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isActFinding))).toEqual(expected)
		})
})
