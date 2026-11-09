import { caseStatusOf } from './case-status.ts'

import { describe, expect, it } from 'vitest'

import type { CaseStatus, LotCaseEntry, ReceiptKind, TddEntry } from './tdd.types.ts'

const FILE = 'src/add.test.ts'

/** A receipt of case `name` in FILE at test file `hash` and case text `text`. */
function receipt(params: {
	kind: ReceiptKind
	name: string
	hash: string
	text: string
}): TddEntry {
	return {
		kind: params.kind,
		file: FILE,
		name: params.name,
		project: '',
		testFileHash: params.hash,
		caseHash: params.text,
		productionHash: 'p',
		at: '2026-10-29T00:00:00.000Z',
	}
}

/** A red run that froze FILE at `hash`. */
function freeze(hash: string): TddEntry {
	return { kind: 'freeze', files: { [FILE]: hash }, at: '2026-10-29T00:00:00.000Z' }
}

type Case = { entries: TddEntry[]; name: string; hash: string; text: string; status: CaseStatus }

const RED_A = receipt({ kind: 'red', name: 'A', hash: 'h1', text: 'a1' })
const GREEN_A = receipt({ kind: 'green', name: 'A', hash: 'h1', text: 'a1' })

const CASES: Record<string, Case> = {
	'no receipt → missing receipt': {
		entries: [],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'missing receipt',
	},
	'a receipt of another case only → missing receipt': {
		entries: [receipt({ kind: 'red', name: 'B', hash: 'h1', text: 'b1' }), freeze('h1')],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'missing receipt',
	},
	'red, its file frozen as it is → red': {
		entries: [RED_A, freeze('h1')],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'red',
	},
	'red, its file edited since the freeze → test edited after red': {
		entries: [RED_A, freeze('h1')],
		name: 'A',
		hash: 'h2',
		text: 'a1',
		status: 'test edited after red',
	},
	'red, the file re-frozen by a later red run but the case text changed since its receipt → test edited after red':
		{
			entries: [
				RED_A,
				freeze('h1'),
				receipt({ kind: 'red', name: 'B', hash: 'h2', text: 'b1' }),
				freeze('h2'),
			],
			name: 'A',
			hash: 'h2',
			text: 'a2',
			status: 'test edited after red',
		},
	'red, a refused receipt only → missing receipt': {
		entries: [receipt({ kind: 'refused', name: 'A', hash: 'h1', text: 'a1' })],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'missing receipt',
	},
	'red then green → green': {
		entries: [RED_A, freeze('h1'), GREEN_A],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'green',
	},
	'green, then a later red run froze test code again → red until green again': {
		entries: [
			RED_A,
			freeze('h1'),
			GREEN_A,
			receipt({ kind: 'red', name: 'B', hash: 'h2', text: 'b1' }),
			freeze('h2'),
		],
		name: 'A',
		hash: 'h2',
		text: 'a1',
		status: 'red',
	},
	'green again after the later freeze → green': {
		entries: [
			RED_A,
			freeze('h1'),
			GREEN_A,
			receipt({ kind: 'red', name: 'B', hash: 'h2', text: 'b1' }),
			freeze('h2'),
			receipt({ kind: 'green', name: 'A', hash: 'h2', text: 'a1' }),
		],
		name: 'A',
		hash: 'h2',
		text: 'a1',
		status: 'green',
	},
	'passed at a red run, the same case as at the base → unchanged': {
		entries: [receipt({ kind: 'unchanged', name: 'A', hash: 'h1', text: 'a1' }), freeze('h1')],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'unchanged',
	},
	'a refusal after a green → still green': {
		entries: [
			RED_A,
			freeze('h1'),
			GREEN_A,
			receipt({ kind: 'refused', name: 'A', hash: 'h1', text: 'a1' }),
		],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'green',
	},
	'red but its file never frozen (its red run was refused) → test edited after red': {
		entries: [RED_A],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'test edited after red',
	},
}

const ACCEPT_ENTRY: LotCaseEntry = { case: `${FILE}::A`, reason: 'pins behaviour that exists' }
const ACCEPTED_A = receipt({ kind: 'accepted', name: 'A', hash: 'h1', text: 'a1' })

type DeclaredCase = Case & {
	acceptances: LotCaseEntry[]
	revisions: LotCaseEntry[]
}

/** Rows whose status the lot file's declarations decide (the rows where it stays as before are in `countingReceipts`). */
const DECLARED_CASES: Record<string, DeclaredCase> = {
	'red, green, then an accepted receipt whose accept entry was removed → green, not accepted': {
		entries: [RED_A, freeze('h1'), GREEN_A, ACCEPTED_A],
		acceptances: [],
		revisions: [],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'green',
	},
	'red, green, then an accepted receipt, its accept entry still declared → green: an acceptance after a proof never counts':
		{
			entries: [RED_A, freeze('h1'), GREEN_A, ACCEPTED_A],
			acceptances: [ACCEPT_ENTRY],
			revisions: [],
			name: 'A',
			hash: 'h1',
			text: 'a1',
			status: 'green',
		},
	'an accepted receipt on a case with no red, its entry removed → missing receipt': {
		entries: [ACCEPTED_A, freeze('h1')],
		acceptances: [],
		revisions: [],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'missing receipt',
	},
	'red, green, the file edited, then an accepted receipt at the new hash, its entry removed → red, a fresh green owed':
		{
			entries: [
				RED_A,
				freeze('h1'),
				GREEN_A,
				receipt({ kind: 'accepted', name: 'A', hash: 'h2', text: 'a1' }),
				freeze('h2'),
			],
			acceptances: [],
			revisions: [],
			name: 'A',
			hash: 'h2',
			text: 'a1',
			status: 'red',
		},
	'the same, its accept entry still declared → red as well: the acceptance is no proof of a case already proven':
		{
			entries: [
				RED_A,
				freeze('h1'),
				GREEN_A,
				receipt({ kind: 'accepted', name: 'A', hash: 'h2', text: 'a1' }),
				freeze('h2'),
			],
			acceptances: [ACCEPT_ENTRY],
			revisions: [],
			name: 'A',
			hash: 'h2',
			text: 'a1',
			status: 'red',
		},
	'red, green, then a revised receipt (the case edited at review), its revised entry removed → test edited after red':
		{
			entries: [
				RED_A,
				freeze('h1'),
				GREEN_A,
				receipt({ kind: 'revised', name: 'A', hash: 'h2', text: 'a2' }),
				freeze('h2'),
			],
			acceptances: [],
			revisions: [],
			name: 'A',
			hash: 'h2',
			text: 'a2',
			status: 'test edited after red',
		},
}

describe('caseStatusOf with the lot file declarations', () => {
	for (const [name, testCase] of Object.entries(DECLARED_CASES))
		it(name, () => {
			expect(
				caseStatusOf({
					ledger: { version: 3, entries: testCase.entries },
					testCase: { file: FILE, name: testCase.name, project: '' },
					testFileHash: testCase.hash,
					caseHash: testCase.text,
					acceptances: testCase.acceptances,
					revisions: testCase.revisions,
				}),
			).toBe(testCase.status)
		})
})

/** The status of case `name` (receipts at hash h1, text a1) in `entries`, with the lot file's declarations. */
function statusWith(params: {
	entries: TddEntry[]
	name: string
	acceptances: LotCaseEntry[]
	revisions: LotCaseEntry[]
	hash?: string
	text?: string
}): CaseStatus {
	return caseStatusOf({
		ledger: { version: 3, entries: params.entries },
		testCase: { file: FILE, name: params.name, project: '' },
		testFileHash: params.hash ?? 'h1',
		caseHash: params.text ?? 'a1',
		acceptances: params.acceptances,
		revisions: params.revisions,
	})
}

describe('caseStatusOf: a whole-file revision removed', () => {
	it('red, green, the file edited (a freeze at a new hash), a revised receipt of the same case hash, the entry removed → red: a green is owed after the freeze', () => {
		const entries = [
			RED_A,
			freeze('h1'),
			GREEN_A,
			receipt({ kind: 'revised', name: 'A', hash: 'h2', text: 'a1' }),
			freeze('h2'),
		]

		expect(statusWith({ entries, name: 'A', acceptances: [], revisions: [], hash: 'h2' })).toBe(
			'red',
		)
	})
})

describe('caseStatusOf: a receipt that still counts', () => {
	it('an accepted receipt, no red, its accept entry declared, beside a proven case whose accepted receipt is stale → accepted for the first, green for the second', () => {
		const entries = [
			receipt({ kind: 'accepted', name: 'A', hash: 'h1', text: 'a1' }),
			receipt({ kind: 'red', name: 'B', hash: 'h1', text: 'a1' }),
			freeze('h1'),
			receipt({ kind: 'green', name: 'B', hash: 'h1', text: 'a1' }),
			receipt({ kind: 'accepted', name: 'B', hash: 'h1', text: 'a1' }),
		]

		expect({
			counts: statusWith({ entries, name: 'A', acceptances: [ACCEPT_ENTRY], revisions: [] }),
			stale: statusWith({ entries, name: 'B', acceptances: [ACCEPT_ENTRY], revisions: [] }),
		}).toEqual({ counts: 'accepted', stale: 'green' })
	})

	it('a revised receipt with its revised entry kept, beside one whose entry was removed → revised for the first, test edited after red for the second', () => {
		const entries = [
			receipt({ kind: 'red', name: 'A', hash: 'h2', text: 'a1' }),
			freeze('h2'),
			receipt({ kind: 'green', name: 'A', hash: 'h2', text: 'a1' }),
			receipt({ kind: 'revised', name: 'A', hash: 'h2', text: 'a2' }),
			receipt({ kind: 'red', name: 'B', hash: 'h2', text: 'a1' }),
			receipt({ kind: 'green', name: 'B', hash: 'h2', text: 'a1' }),
			receipt({ kind: 'revised', name: 'B', hash: 'h2', text: 'a2' }),
		]
		const revisions: LotCaseEntry[] = [{ case: `${FILE}::A`, reason: 'the review asked for it' }]
		const options = { entries, acceptances: [], revisions, hash: 'h2', text: 'a2' }

		expect({
			kept: statusWith({ ...options, name: 'A' }),
			removed: statusWith({ ...options, name: 'B' }),
		}).toEqual({ kept: 'revised', removed: 'test edited after red' })
	})
})

describe('caseStatusOf', () => {
	for (const [name, testCase] of Object.entries(CASES))
		it(name, () => {
			expect(
				caseStatusOf({
					ledger: { version: 3, entries: testCase.entries },
					testCase: { file: FILE, name: testCase.name, project: '' },
					testFileHash: testCase.hash,
					caseHash: testCase.text,
					acceptances: [],
					revisions: [],
				}),
			).toBe(testCase.status)
		})
})
