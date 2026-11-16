import { packRecordOf } from '../../../../test/ask-records-fixtures.ts'
import { citeOf } from '../../../../test/ask-report-fixtures.ts'
import { readerMissOf } from './reader-miss-of.ts'

import { describe, expect, it } from 'vitest'

import type { GivenRange } from '../../../../test/ask-records-fixtures.types.ts'
import type { PackRecord, ReaderMiss, ReportCite } from './ask.types.ts'

/** A cite of a range, quoting the words the miss never reads. */
function cited(params: { file: string; from: number; to: number }): ReportCite {
	return citeOf({
		...params,
		quote: 'the element AA_1 shall hold the child AAA_1 in its content model',
	})
}

/** The slices the packs name: S1 lines 10-20 and S2 lines 30-40 of one file, S3 lines 10-20 of another. */
const SLICES: GivenRange[] = [
	{ id: 'S1', file: 'example-0000/tag', from: 10, to: 20 },
	{ id: 'S2', file: 'example-0000/tag', from: 30, to: 40 },
	{ id: 'S3', file: 'example-0000/other', from: 10, to: 20 },
]

/** Round 1 gave S1 to both readers; round 2 gave S2 to reader A and S3 to reader B. */
const ROUND_ONE_GIVES_S1: PackRecord = packRecordOf({
	ask: 'A-0001',
	round: 1,
	given: [['S1'], ['S1']],
	known: SLICES,
})
const ROUND_TWO_GIVES_S2_AND_S3: PackRecord = packRecordOf({
	ask: 'A-0001',
	round: 2,
	given: [['S2'], ['S3']],
	known: SLICES,
})

type MissRow = { cite: ReportCite; packs: PackRecord[]; expected: ReaderMiss }

const ROWS: Record<string, MissRow> = {
	'a cite inside a slice given in round 2 -> given, round 2': {
		cite: cited({ file: 'example-0000/tag', from: 31, to: 33 }),
		packs: [ROUND_ONE_GIVES_S1, ROUND_TWO_GIVES_S2_AND_S3],
		expected: { given: true, round: 2 },
	},
	'a cite on the exact range of a slice given in round 1 -> given, round 1': {
		cite: cited({ file: 'example-0000/tag', from: 10, to: 20 }),
		packs: [ROUND_ONE_GIVES_S1, ROUND_TWO_GIVES_S2_AND_S3],
		expected: { given: true, round: 1 },
	},
	'a slice given in rounds 1 and 2 -> given, the first of them (round 1)': {
		cite: cited({ file: 'example-0000/tag', from: 12, to: 14 }),
		packs: [ROUND_ONE_GIVES_S1, packRecordOf({ ask: 'A-0001', round: 2, given: [['S1'], ['S1']] })],
		expected: { given: true, round: 1 },
	},
	'a slice given to a reader of round 2 only (the other reader had another) -> given, round 2': {
		cite: cited({ file: 'example-0000/other', from: 12, to: 12 }),
		packs: [ROUND_ONE_GIVES_S1, ROUND_TWO_GIVES_S2_AND_S3],
		expected: { given: true, round: 2 },
	},
	'a cite in a slice the ask listed but no round gave -> not given, no round': {
		cite: cited({ file: 'example-0000/tag', from: 31, to: 33 }),
		packs: [ROUND_ONE_GIVES_S1],
		expected: { given: false, round: null },
	},
	'a cite between two slices -> not given, no round': {
		cite: cited({ file: 'example-0000/tag', from: 22, to: 25 }),
		packs: [ROUND_ONE_GIVES_S1, ROUND_TWO_GIVES_S2_AND_S3],
		expected: { given: false, round: null },
	},
	'a cite that starts inside a slice and ends past it -> not given, no round': {
		cite: cited({ file: 'example-0000/tag', from: 18, to: 24 }),
		packs: [ROUND_ONE_GIVES_S1, ROUND_TWO_GIVES_S2_AND_S3],
		expected: { given: false, round: null },
	},
	'the lines of a slice given in another file -> not given, no round': {
		cite: cited({ file: 'example-0000/third', from: 12, to: 12 }),
		packs: [ROUND_ONE_GIVES_S1, ROUND_TWO_GIVES_S2_AND_S3],
		expected: { given: false, round: null },
	},
	'no round packed yet -> not given, no round': {
		cite: cited({ file: 'example-0000/tag', from: 12, to: 12 }),
		packs: [],
		expected: { given: false, round: null },
	},
}

describe('readerMissOf: was the cited range given to a reader, and in which round (section 8)', () => {
	it.each(Object.entries(ROWS))('%s', (_title, row) => {
		expect(readerMissOf({ cite: row.cite, packs: row.packs })).toEqual(row.expected)
	})
})
