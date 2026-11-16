import { documentAcceptedOf } from '../../../../test/ask-agreement-fixtures.ts'
import { askSliceOf } from '../../../../test/ask-pack-fixtures.ts'
import {
	GIVEN_DIRECT,
	GIVEN_LINKED,
	REPORT_FILE,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { verifiedAnglesOf } from './verified-angles-of.ts'

import { describe, expect, it } from 'vitest'

import type { VerifiedAnglesOfParams } from './ask.types.ts'

/** The ask's two slices, each over the range of a given slice of the report fixtures, with distinct angles. */
const SLICES = [
	askSliceOf({
		id: 's1',
		file: REPORT_FILE,
		from: GIVEN_DIRECT.from,
		to: GIVEN_DIRECT.to,
		angles: ['a1', 'a2'],
	}),
	askSliceOf({
		id: 's2',
		file: REPORT_FILE,
		from: GIVEN_LINKED.from,
		to: GIVEN_LINKED.to,
		angles: ['a1', 'a3'],
	}),
]

/** A report whose verified cite is in the first slice, and one whose verified cite is in the second. */
const IN_FIRST = documentAcceptedOf({ letter: 'A', lines: { from: 12, to: 13 } })
const IN_SECOND = documentAcceptedOf({
	letter: 'B',
	lines: { from: 105, to: 106 },
	given: GIVEN_LINKED,
})

const ROWS: Record<string, { params: VerifiedAnglesOfParams; angles: string[] }> = {
	'a verified cite in the first slice only -> its angles': {
		params: { accepted: [IN_FIRST], slices: SLICES },
		angles: ['a1', 'a2'],
	},
	'verified cites in both slices -> the angles of both, each once, sorted': {
		params: { accepted: [IN_SECOND, IN_FIRST], slices: SLICES },
		angles: ['a1', 'a2', 'a3'],
	},
	'a refused cite in the second slice beside a verified one in the first -> the second angles are not counted':
		{
			params: {
				accepted: [documentAcceptedOf({ letter: 'A', refusedCiteLines: { from: 105, to: 106 } })],
				slices: SLICES,
			},
			angles: ['a1', 'a2'],
		},
	'no accepted report -> nothing': {
		params: { accepted: [], slices: SLICES },
		angles: [],
	},
	'an accepted report with no verified cite (not-in-text) -> nothing': {
		params: {
			accepted: [documentAcceptedOf({ letter: 'A', verdict: 'not-in-text' })],
			slices: SLICES,
		},
		angles: [],
	},
}

describe('verifiedAnglesOf: the angles of the slices that hold a verified cite (D39)', () => {
	it.each(Object.entries(ROWS))('%s', (_title, row) => {
		expect(verifiedAnglesOf(row.params)).toEqual(row.angles)
	})
})
