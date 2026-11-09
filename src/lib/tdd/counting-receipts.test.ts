import { countingReceipts, isProvenRedThenGreen } from './counting-receipts.ts'

import { describe, expect, it } from 'vitest'

import type {
	CountingReceipts,
	LotCaseEntry,
	ReceiptKind,
	SkippedReceiptReason,
	TddEntry,
	TddReceipt,
} from './tdd.types.ts'

const FILE = 'src/add.test.ts'
const LABEL = `${FILE}::A`

/** A receipt of case A in FILE at case text `text`. */
function receipt(params: { kind: ReceiptKind; text: string }): TddReceipt {
	return {
		kind: params.kind,
		file: FILE,
		name: 'A',
		project: '',
		testFileHash: 'h1',
		caseHash: params.text,
		productionHash: 'p',
		at: '2026-10-29T00:00:00.000Z',
	}
}

const RED = receipt({ kind: 'red', text: 'a1' })
const GREEN = receipt({ kind: 'green', text: 'a1' })
const ACCEPTED = receipt({ kind: 'accepted', text: 'a1' })
const REVISED = receipt({ kind: 'revised', text: 'a2' })

const ACCEPT_ENTRY: LotCaseEntry = { case: LABEL, reason: 'pins behaviour that already exists' }
const REVISED_ENTRY: LotCaseEntry = { case: LABEL, reason: 'the review asked for it' }
const REVISED_GLOB_ENTRY: LotCaseEntry = {
	case: 'src/**/*.test.ts',
	reason: 'the loops were merged',
}

type Row = {
	entries: TddEntry[]
	acceptances: LotCaseEntry[]
	revisions: LotCaseEntry[]
	/** The kinds of the receipts that count, oldest first. */
	counting: ReceiptKind[]
	/** The kind and the reason of each skipped receipt, oldest first. */
	skipped: Array<[ReceiptKind, SkippedReceiptReason]>
}

const ROWS: Record<string, Row> = {
	'red, green, then an accepted receipt whose accept entry is gone → the accepted one skipped as no longer declared, the proof counts':
		{
			entries: [RED, GREEN, ACCEPTED],
			acceptances: [],
			revisions: [],
			counting: ['red', 'green'],
			skipped: [['accepted', 'no longer declared']],
		},
	'red, green, then an accepted receipt, its accept entry still declared → the accepted one skipped: a red then a green of its case hash precede it':
		{
			entries: [RED, GREEN, ACCEPTED],
			acceptances: [ACCEPT_ENTRY],
			revisions: [],
			counting: ['red', 'green'],
			skipped: [['accepted', 'proven red → green before it']],
		},
	'an accepted receipt on a case with no red, its entry still declared → it counts': {
		entries: [ACCEPTED],
		acceptances: [ACCEPT_ENTRY],
		revisions: [],
		counting: ['accepted'],
		skipped: [],
	},
	'an accepted receipt on a case with no red, its entry removed → nothing counts, the receipt skipped as no longer declared':
		{
			entries: [ACCEPTED],
			acceptances: [],
			revisions: [],
			counting: [],
			skipped: [['accepted', 'no longer declared']],
		},
	'a red then a green of an older case hash, then an accepted receipt of the current one, its entry declared → the older proof is no proof of this case: the accepted one counts':
		{
			entries: [
				receipt({ kind: 'red', text: 'a0' }),
				receipt({ kind: 'green', text: 'a0' }),
				ACCEPTED,
			],
			acceptances: [ACCEPT_ENTRY],
			revisions: [],
			counting: ['red', 'green', 'accepted'],
			skipped: [],
		},
	'a red still owing its green, then an accepted receipt, its entry declared → the accepted one counts (an acceptance overrides only a proven case)':
		{
			entries: [RED, ACCEPTED],
			acceptances: [ACCEPT_ENTRY],
			revisions: [],
			counting: ['red', 'accepted'],
			skipped: [],
		},
	'a red, a green, a red again (its green owed once more), then an accepted receipt, its entry declared → the accepted one counts: no proof stands before it now':
		{
			entries: [RED, GREEN, RED, ACCEPTED],
			acceptances: [ACCEPT_ENTRY],
			revisions: [],
			counting: ['red', 'green', 'red', 'accepted'],
			skipped: [],
		},
	'a green before its red, then an accepted receipt, its entry declared → no red then green precedes it: it counts':
		{
			entries: [GREEN, RED, ACCEPTED],
			acceptances: [ACCEPT_ENTRY],
			revisions: [],
			counting: ['green', 'red', 'accepted'],
			skipped: [],
		},
	'a revised receipt (the case edited at review after a proof of the old one), its revised entry removed → the revised one skipped as no longer declared':
		{
			entries: [RED, GREEN, REVISED],
			acceptances: [],
			revisions: [],
			counting: ['red', 'green'],
			skipped: [['revised', 'no longer declared']],
		},
	'a revised receipt of the same case hash (recorded through a whole-file entry), the entry removed → the revised one skipped as no longer declared':
		{
			entries: [RED, GREEN, receipt({ kind: 'revised', text: 'a1' })],
			acceptances: [],
			revisions: [],
			counting: ['red', 'green'],
			skipped: [['revised', 'no longer declared']],
		},
	'the same, the whole-file entry kept → the revised one counts': {
		entries: [RED, GREEN, receipt({ kind: 'revised', text: 'a1' })],
		acceptances: [],
		revisions: [REVISED_GLOB_ENTRY],
		counting: ['red', 'green', 'revised'],
		skipped: [],
	},
	'the same, its revised entry kept → the revised one counts': {
		entries: [RED, GREEN, REVISED],
		acceptances: [],
		revisions: [REVISED_ENTRY],
		counting: ['red', 'green', 'revised'],
		skipped: [],
	},
	'the same, a glob entry over its file kept → the revised one counts': {
		entries: [RED, GREEN, REVISED],
		acceptances: [],
		revisions: [REVISED_GLOB_ENTRY],
		counting: ['red', 'green', 'revised'],
		skipped: [],
	},
	'an accepted receipt and a revised receipt, only the revised entry kept → the accepted one skipped, the revised one counts':
		{
			entries: [ACCEPTED, REVISED],
			acceptances: [],
			revisions: [REVISED_ENTRY],
			counting: ['revised'],
			skipped: [['accepted', 'no longer declared']],
		},
}

/** The kinds of the receipts that count, and the kind and reason of each skipped one. */
function summaryOf(result: CountingReceipts): Pick<Row, 'counting' | 'skipped'> {
	return {
		counting: result.counting.map((each) => each.kind),
		skipped: result.skipped.map((each) => [each.receipt.kind, each.reason]),
	}
}

describe('countingReceipts', () => {
	for (const [name, row] of Object.entries(ROWS))
		it(name, () => {
			expect(
				summaryOf(
					countingReceipts({
						ledger: { version: 3, entries: row.entries },
						testCase: { file: FILE, name: 'A', project: '' },
						acceptances: row.acceptances,
						revisions: row.revisions,
					}),
				),
			).toEqual({ counting: row.counting, skipped: row.skipped })
		})

	it('the receipts of another case → neither counted nor skipped', () => {
		const other: TddReceipt = { ...RED, name: 'B' }

		expect(
			countingReceipts({
				ledger: { version: 3, entries: [other, { ...ACCEPTED, name: 'B' }, RED] },
				testCase: { file: FILE, name: 'A', project: '' },
				acceptances: [],
				revisions: [],
			}),
		).toEqual({ counting: [RED], skipped: [] })
	})
})

describe('isProvenRedThenGreen', () => {
	it('red, green → proven; red, green, red again → not proven (its green is owed once more); a green of another case hash does not prove', () => {
		expect({
			redGreen: isProvenRedThenGreen({ receipts: [RED, GREEN], caseHash: 'a1' }),
			redGreenRed: isProvenRedThenGreen({ receipts: [RED, GREEN, RED], caseHash: 'a1' }),
			otherHash: isProvenRedThenGreen({
				receipts: [RED, receipt({ kind: 'green', text: 'a0' })],
				caseHash: 'a1',
			}),
		}).toEqual({ redGreen: true, redGreenRed: false, otherHash: false })
	})
})
